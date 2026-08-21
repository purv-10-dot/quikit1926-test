import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * POST /api/auth/mobile/google — native Android Google sign-in.
 *
 * The contract that matters to the mobile team: a verified Google identity
 * that maps to an existing QuikIT user comes back as a `handoffUrl` they
 * follow with their persisted QuikInfra cookie jar. Everything else is a
 * typed rejection.
 *
 * Hand-rolled mocks, matching verifyToken.test.ts in this directory.
 */

const h = vi.hoisted(() => ({
  verifyGoogleIdToken: vi.fn(),
  resolveOAuthIdentity: vi.fn(),
  resolveOrgContext: vi.fn(),
  mintHandoffToken: vi.fn(async () => "signed.handoff.token"),
  createAuthSession: vi.fn(async () => "sess-1"),
  acceptPendingInvites: vi.fn(async () => 0),
}));

vi.mock("@quikit/auth/mobile", async () => {
  // Keep the REAL allow-list and audience helper — an accidental widening of
  // the origin allow-list is exactly the kind of thing this suite should catch.
  const actual = await vi.importActual<typeof import("@quikit/auth/mobile")>(
    "@quikit/auth/mobile",
  );
  return {
    allowedTargetOrigins: actual.allowedTargetOrigins,
    googleMobileAudiences: actual.googleMobileAudiences,
    verifyGoogleIdToken: h.verifyGoogleIdToken,
    resolveOAuthIdentity: h.resolveOAuthIdentity,
    resolveOrgContext: h.resolveOrgContext,
    mintHandoffToken: h.mintHandoffToken,
    acceptPendingInvites: h.acceptPendingInvites,
  };
});

vi.mock("@quikit/auth/session-store", () => ({
  createAuthSession: h.createAuthSession,
}));

import { POST } from "@/app/api/auth/mobile/google/route";

const ALLOWED_ORIGIN = "https://uatinfra.quikit.ai";

const DB_USER = {
  id: "user-1",
  email: "member@quikit.ai",
  firstName: "Member",
  lastName: "One",
  isSuperAdmin: false,
};

function makeRequest(body: unknown) {
  return new NextRequest(
    new URL("http://localhost:3001/api/auth/mobile/google"),
    {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "content-type": "application/json" },
    } as never,
  );
}

beforeEach(() => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "web-client-id.apps.googleusercontent.com");
  vi.stubEnv("INTERNAL_SECRET", "test-internal-secret");
  h.verifyGoogleIdToken.mockResolvedValue({
    email: DB_USER.email,
    givenName: "Member",
    familyName: "One",
    sub: "google-sub-1",
  });
  h.resolveOAuthIdentity.mockResolvedValue({ ok: true, dbUser: DB_USER });
  h.resolveOrgContext.mockResolvedValue({
    orgId: "org-1",
    membershipRole: "member",
    email: DB_USER.email,
    firstName: "Member",
    lastName: "One",
    name: "Member One",
  });
});

describe("happy path", () => {
  it("returns a handoff URL on the requested origin", async () => {
    const res = await POST(
      makeRequest({ idToken: "google-id-token", targetOrigin: ALLOWED_ORIGIN }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.handoffUrl).toBe(
      `${ALLOWED_ORIGIN}/auth-handoff?token=signed.handoff.token`,
    );
  });

  it("creates a 30-day soft-revocable session and carries its id in the token", async () => {
    await POST(
      makeRequest({ idToken: "google-id-token", targetOrigin: ALLOWED_ORIGIN }),
    );
    expect(h.createAuthSession).toHaveBeenCalledWith(DB_USER.id, 30 * 24 * 60 * 60);
    expect(h.mintHandoffToken).toHaveBeenCalledWith(
      "test-internal-secret",
      expect.objectContaining({ userId: DB_USER.id, sessionId: "sess-1" }),
    );
  });

  it("defaults `to` to '/' and honours it when supplied", async () => {
    await POST(
      makeRequest({ idToken: "t", targetOrigin: ALLOWED_ORIGIN }),
    );
    expect(h.mintHandoffToken).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ to: "/" }),
    );

    await POST(
      makeRequest({ idToken: "t", targetOrigin: ALLOWED_ORIGIN, to: "/projects" }),
    );
    expect(h.mintHandoffToken).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ to: "/projects" }),
    );
  });

  it("accepts pending invites BEFORE resolving org context", async () => {
    const order: string[] = [];
    h.acceptPendingInvites.mockImplementation(async () => {
      order.push("accept");
      return 1;
    });
    h.resolveOrgContext.mockImplementation(async () => {
      order.push("resolveOrg");
      return {
        orgId: "org-1",
        membershipRole: "member",
        email: DB_USER.email,
        firstName: null,
        lastName: null,
        name: null,
      };
    });

    await POST(
      makeRequest({ idToken: "t", targetOrigin: ALLOWED_ORIGIN }),
    );

    expect(h.acceptPendingInvites).toHaveBeenCalledWith(DB_USER.id);
    // Ordering is the whole fix: resolveOrgContext only counts `active`
    // memberships, so a `native` invite accepted after it would be missed
    // and the handoff token would carry a null orgId.
    expect(order).toEqual(["accept", "resolveOrg"]);
  });

  it("does not accept invites for an identity with no QuikIT account", async () => {
    h.resolveOAuthIdentity.mockResolvedValue({ ok: false, reason: "unknown_user" });
    await POST(makeRequest({ idToken: "t", targetOrigin: ALLOWED_ORIGIN }));
    expect(h.acceptPendingInvites).not.toHaveBeenCalled();
  });

  it("verifies the token against the WEB client id", async () => {
    await POST(
      makeRequest({ idToken: "google-id-token", targetOrigin: ALLOWED_ORIGIN }),
    );
    expect(h.verifyGoogleIdToken).toHaveBeenCalledWith("google-id-token", [
      "web-client-id.apps.googleusercontent.com",
    ]);
  });
});

describe("rejections", () => {
  it("400s an unknown targetOrigin WITHOUT ever verifying the Google token", async () => {
    const res = await POST(
      makeRequest({ idToken: "t", targetOrigin: "https://evil.example.com" }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Unknown targetOrigin");
    // The ordering is the security property: this endpoint must not become a
    // token-validity oracle for an attacker-chosen origin.
    expect(h.verifyGoogleIdToken).not.toHaveBeenCalled();
  });

  it("401s an invalid or expired Google ID token", async () => {
    h.verifyGoogleIdToken.mockRejectedValue(new Error("Token used too late"));
    const res = await POST(
      makeRequest({ idToken: "expired", targetOrigin: ALLOWED_ORIGIN }),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Token used too late");
  });

  it("403s a valid Google identity with no QuikIT account — no auto-provisioning", async () => {
    h.resolveOAuthIdentity.mockResolvedValue({ ok: false, reason: "unknown_user" });
    const res = await POST(
      makeRequest({ idToken: "t", targetOrigin: ALLOWED_ORIGIN }),
    );
    expect(res.status).toBe(403);
    expect(h.createAuthSession).not.toHaveBeenCalled();
  });

  it("400s a malformed body", async () => {
    const res = await POST(makeRequest({ targetOrigin: ALLOWED_ORIGIN }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("idToken");
  });

  it("400s a non-JSON body", async () => {
    const res = await POST(makeRequest("not json at all"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Body must be JSON");
  });

  it("500s when the server is missing GOOGLE_CLIENT_ID", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    const res = await POST(
      makeRequest({ idToken: "t", targetOrigin: ALLOWED_ORIGIN }),
    );
    expect(res.status).toBe(500);
    expect(h.verifyGoogleIdToken).not.toHaveBeenCalled();
  });
});

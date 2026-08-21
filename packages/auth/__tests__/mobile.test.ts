import { describe, it, expect, beforeEach, vi } from "vitest";
import { jwtVerify } from "jose";

/**
 * Guards the shared auth building blocks that native-mobile Google sign-in
 * and the existing WEB flows (`signIn` callback + `/api/post-login`) now
 * both call.
 *
 * The whole point of `mobile.ts` is that there is ONE implementation
 * instead of two copies that can drift. So these tests are really
 * protecting web login just as much as mobile: if `resolveOAuthIdentity`
 * stops auto-accepting SSO invites, or `mintHandoffToken` changes its claim
 * shape, web breaks first.
 *
 * Hand-rolled Prisma mock rather than vitest-mock-extended — mobile.ts
 * touches exactly three models, so a deep mock adds nothing.
 */

const h = vi.hoisted(() => ({
  userFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  orgMemberFindMany: vi.fn(async () => [] as unknown[]),
  orgMemberFindFirst: vi.fn(),
  orgMemberUpdate: vi.fn(async () => ({})),
  userAppAccessCreateMany: vi.fn(async () => ({ count: 0 })),
  setOAuthPrefill: vi.fn(async () => undefined),
}));

vi.mock("@quikit/database", () => ({
  db: {
    user: { findFirst: h.userFindFirst, findUnique: h.userFindUnique },
    orgMember: {
      findMany: h.orgMemberFindMany,
      findFirst: h.orgMemberFindFirst,
      update: h.orgMemberUpdate,
    },
    userAppAccess: { createMany: h.userAppAccessCreateMany },
  },
}));

vi.mock("../oauth-prefill-store", () => ({ setOAuthPrefill: h.setOAuthPrefill }));

import {
  acceptPendingInvites,
  allowedTargetOrigins,
  googleMobileAudiences,
  mintHandoffToken,
  resolveOAuthIdentity,
  resolveOrgContext,
} from "../mobile";

const USER = {
  id: "user-1",
  email: "member@quikit.ai",
  firstName: "Member",
  lastName: "One",
  isSuperAdmin: false,
};

beforeEach(() => {
  h.orgMemberFindMany.mockResolvedValue([]);
  h.setOAuthPrefill.mockResolvedValue(undefined);
});

// ─── resolveOAuthIdentity ─────────────────────────────────────────────────

describe("resolveOAuthIdentity", () => {
  it("rejects an OAuth attempt with no email", async () => {
    const result = await resolveOAuthIdentity({ provider: "google", email: null });
    expect(result).toEqual({ ok: false, reason: "no_email" });
    expect(h.userFindFirst).not.toHaveBeenCalled();
  });

  it("rejects an unknown email — there is NO auto-provisioning", async () => {
    h.userFindFirst.mockResolvedValue(null);
    const result = await resolveOAuthIdentity({
      provider: "google",
      email: "stranger@example.com",
    });
    expect(result).toEqual({ ok: false, reason: "unknown_user" });
    expect(h.userAppAccessCreateMany).not.toHaveBeenCalled();
  });

  it("matches the user case-insensitively and lowercases the lookup", async () => {
    h.userFindFirst.mockResolvedValue(USER);
    const result = await resolveOAuthIdentity({
      provider: "google",
      email: "Member@QuikIT.ai",
    });
    expect(result).toEqual({ ok: true, dbUser: USER });
    expect(h.userFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { equals: "member@quikit.ai", mode: "insensitive" } },
      }),
    );
  });

  it("stashes the provider's names for the post-login pre-fill form", async () => {
    h.userFindFirst.mockResolvedValue(USER);
    await resolveOAuthIdentity({
      provider: "google",
      email: USER.email,
      oauthFirstName: "Given",
      oauthLastName: "Family",
    });
    expect(h.setOAuthPrefill).toHaveBeenCalledWith(USER.id, {
      firstName: "Given",
      lastName: "Family",
    });
  });

  it("auto-accepts a pending SSO invite and grants its app access", async () => {
    h.userFindFirst.mockResolvedValue(USER);
    h.orgMemberFindMany.mockResolvedValue([
      {
        id: "member-1",
        orgId: "org-1",
        role: "app_admin",
        inviteAppIds: ["app-quikinfra"],
        createdBy: "admin-1",
      },
    ]);

    const result = await resolveOAuthIdentity({
      provider: "google",
      email: USER.email,
    });

    expect(result.ok).toBe(true);
    expect(h.orgMemberUpdate).toHaveBeenCalledWith({
      where: { id: "member-1" },
      data: expect.objectContaining({ status: "active", invitationToken: null }),
    });
    expect(h.userAppAccessCreateMany).toHaveBeenCalledWith({
      data: [
        {
          userId: USER.id,
          orgId: "org-1",
          appId: "app-quikinfra",
          role: "admin",
          grantedBy: "admin-1",
        },
      ],
      skipDuplicates: true,
    });
  });

  it("grants 'member' for a non-app_admin invite", async () => {
    h.userFindFirst.mockResolvedValue(USER);
    h.orgMemberFindMany.mockResolvedValue([
      {
        id: "member-2",
        orgId: "org-1",
        role: "member",
        inviteAppIds: ["app-quikinfra"],
        createdBy: "admin-1",
      },
    ]);
    await resolveOAuthIdentity({ provider: "google", email: USER.email });
    expect(h.userAppAccessCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ role: "member" })],
      }),
    );
  });

  it("still resolves identity when the pre-fill stash throws (Redis down)", async () => {
    h.userFindFirst.mockResolvedValue(USER);
    h.setOAuthPrefill.mockRejectedValue(new Error("redis unreachable"));
    const result = await resolveOAuthIdentity({
      provider: "google",
      email: USER.email,
    });
    expect(result).toEqual({ ok: true, dbUser: USER });
  });
});

// ─── acceptPendingInvites ─────────────────────────────────────────────────

describe("acceptPendingInvites", () => {
  it("accepts a `native` invite — the one resolveOAuthIdentity skips", async () => {
    h.orgMemberFindMany.mockResolvedValue([
      {
        id: "member-native",
        orgId: "org-1",
        role: "member",
        inviteMethod: "native",
        inviteAppIds: ["app-quikinfra"],
        createdBy: "admin-1",
      },
    ]);

    const count = await acceptPendingInvites(USER.id);

    expect(count).toBe(1);
    // The query must NOT filter on inviteMethod — that is the whole point.
    expect(h.orgMemberFindMany).toHaveBeenCalledWith({
      where: { userId: USER.id, status: "invited" },
    });
    expect(h.orgMemberUpdate).toHaveBeenCalledWith({
      where: { id: "member-native" },
      data: expect.objectContaining({ status: "active", invitationToken: null }),
    });
    expect(h.userAppAccessCreateMany).toHaveBeenCalledWith({
      data: [
        {
          userId: USER.id,
          orgId: "org-1",
          appId: "app-quikinfra",
          role: "member",
          grantedBy: "admin-1",
        },
      ],
      skipDuplicates: true,
    });
  });

  it("grants 'admin' for an app_admin invite", async () => {
    h.orgMemberFindMany.mockResolvedValue([
      {
        id: "m",
        orgId: "org-1",
        role: "app_admin",
        inviteAppIds: ["app-quikinfra"],
        createdBy: "admin-1",
      },
    ]);
    await acceptPendingInvites(USER.id);
    expect(h.userAppAccessCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ role: "admin" })],
      }),
    );
  });

  it("skips the app-access grant when the invite carries no appIds", async () => {
    h.orgMemberFindMany.mockResolvedValue([
      { id: "m", orgId: "org-1", role: "member", inviteAppIds: [], createdBy: "a" },
    ]);
    await acceptPendingInvites(USER.id);
    expect(h.orgMemberUpdate).toHaveBeenCalled();
    expect(h.userAppAccessCreateMany).not.toHaveBeenCalled();
  });

  it("is a no-op when nothing is pending", async () => {
    h.orgMemberFindMany.mockResolvedValue([]);
    const count = await acceptPendingInvites(USER.id);
    expect(count).toBe(0);
    expect(h.orgMemberUpdate).not.toHaveBeenCalled();
  });
});

// ─── resolveOrgContext ────────────────────────────────────────────────────

describe("resolveOrgContext", () => {
  beforeEach(() => {
    h.userFindUnique.mockResolvedValue({
      email: USER.email,
      firstName: "Member",
      lastName: "One",
    });
  });

  it("looks up the role when the org is known but the role is not", async () => {
    h.orgMemberFindFirst.mockResolvedValue({ role: "org_admin" });
    const ctx = await resolveOrgContext({ userId: USER.id, knownOrgId: "org-1" });
    expect(ctx.orgId).toBe("org-1");
    expect(ctx.membershipRole).toBe("org_admin");
    expect(ctx.name).toBe("Member One");
  });

  it("falls back to the first active membership when no org is known", async () => {
    h.orgMemberFindFirst.mockResolvedValue({ orgId: "org-9", role: "member" });
    const ctx = await resolveOrgContext({ userId: USER.id });
    expect(ctx.orgId).toBe("org-9");
    expect(ctx.membershipRole).toBe("member");
    expect(h.orgMemberFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER.id, status: "active" },
        orderBy: { createdAt: "asc" },
      }),
    );
  });

  it("returns nulls when the user has no active membership at all", async () => {
    h.orgMemberFindFirst.mockResolvedValue(null);
    const ctx = await resolveOrgContext({ userId: USER.id });
    expect(ctx.orgId).toBeNull();
    expect(ctx.membershipRole).toBeNull();
  });

  it("returns a null name when the user row has no names", async () => {
    h.orgMemberFindFirst.mockResolvedValue(null);
    h.userFindUnique.mockResolvedValue({
      email: USER.email,
      firstName: null,
      lastName: null,
    });
    const ctx = await resolveOrgContext({ userId: USER.id });
    expect(ctx.name).toBeNull();
    expect(ctx.email).toBe(USER.email);
  });
});

// ─── mintHandoffToken ─────────────────────────────────────────────────────

describe("mintHandoffToken", () => {
  const SECRET = "test-internal-secret-value";

  it("mints a token every /auth-handoff route can verify, with all claims", async () => {
    const token = await mintHandoffToken(SECRET, {
      userId: USER.id,
      orgId: "org-1",
      isSuperAdmin: false,
      membershipRole: "member",
      email: USER.email,
      firstName: "Member",
      lastName: "One",
      name: "Member One",
      sessionId: "sess-1",
      to: "/dashboard",
    });

    const { payload, protectedHeader } = await jwtVerify(
      token,
      new TextEncoder().encode(SECRET),
    );

    expect(protectedHeader.alg).toBe("HS256");
    expect(payload.sub).toBe(USER.id);
    expect(payload.orgId).toBe("org-1");
    expect(payload.to).toBe("/dashboard");
    expect(payload.membershipRole).toBe("member");
    expect(payload.sessionId).toBe("sess-1");
    expect(payload.jti).toBeTruthy();
  });

  it("expires in 120 seconds — long enough for one redirect hop, no more", async () => {
    const token = await mintHandoffToken(SECRET, {
      userId: USER.id,
      orgId: null,
      isSuperAdmin: false,
      membershipRole: null,
      email: null,
      firstName: null,
      lastName: null,
      name: null,
      sessionId: null,
      to: "/",
    });
    const { payload } = await jwtVerify(token, new TextEncoder().encode(SECRET));
    expect(payload.exp! - payload.iat!).toBe(120);
  });

  it("cannot be verified with a different secret", async () => {
    const token = await mintHandoffToken(SECRET, {
      userId: USER.id,
      orgId: null,
      isSuperAdmin: false,
      membershipRole: null,
      email: null,
      firstName: null,
      lastName: null,
      name: null,
      sessionId: null,
      to: "/",
    });
    await expect(
      jwtVerify(token, new TextEncoder().encode("a-different-secret")),
    ).rejects.toThrow();
  });
});

// ─── allowedTargetOrigins ─────────────────────────────────────────────────

describe("allowedTargetOrigins", () => {
  it("includes the prod and UAT origins web post-login already allowed", () => {
    const origins = allowedTargetOrigins();
    expect(origins.has("https://quikinfra.quikit.ai")).toBe(true);
    expect(origins.has("https://uatinfra.quikit.ai")).toBe(true);
    expect(origins.has("https://apps.quikit.ai")).toBe(true);
  });

  it("merges AUTH_ALLOWED_RETURN_ORIGINS and strips trailing slashes", () => {
    vi.stubEnv(
      "AUTH_ALLOWED_RETURN_ORIGINS",
      "https://extra.quikit.ai/, https://other.quikit.ai",
    );
    const origins = allowedTargetOrigins();
    expect(origins.has("https://extra.quikit.ai")).toBe(true);
    expect(origins.has("https://other.quikit.ai")).toBe(true);
    vi.unstubAllEnvs();
  });

  it("does not allow an arbitrary origin", () => {
    expect(allowedTargetOrigins().has("https://evil.example.com")).toBe(false);
  });
});

// ─── googleMobileAudiences ────────────────────────────────────────────────

describe("googleMobileAudiences", () => {
  it("uses the web client id alone by default", () => {
    expect(googleMobileAudiences("web-client-id")).toEqual(["web-client-id"]);
  });

  it("appends extra client ids from GOOGLE_MOBILE_CLIENT_IDS", () => {
    vi.stubEnv("GOOGLE_MOBILE_CLIENT_IDS", "android-a, android-b");
    expect(googleMobileAudiences("web-client-id")).toEqual([
      "web-client-id",
      "android-a",
      "android-b",
    ]);
    vi.unstubAllEnvs();
  });
});

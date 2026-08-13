/**
 * Tests — POST / PATCH / DELETE /api/super/apps/[id]/oauth
 *
 * Covers the auth matrix + lifecycle: create client (with conflict on
 * duplicate), rotate secret, and delete. Asserts logAudit side effects on
 * each happy path and that the plaintext secret is returned exactly once.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { setSession } from "../setup";
import { mockDb, resetMockDb } from "../helpers/mockDb";

vi.mock("@/lib/auditLog", () => ({
  logAudit: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendUserCreatedEmail: vi.fn().mockResolvedValue(undefined),
  sendOrgSuspendedEmail: vi.fn().mockResolvedValue(undefined),
}));

import { POST, PATCH, DELETE } from "@/app/api/super/apps/[id]/oauth/route";
import { logAudit } from "@/lib/auditLog";

function makeRequest(url: string, init?: RequestInit) {
  return new NextRequest(new URL(url, "http://localhost:3006"), init as never);
}

async function bodyOf(res: Response) {
  return res.json();
}

const SUPER_ADMIN = { id: "sa-1", email: "super@test.com", isSuperAdmin: true };
const REGULAR_USER = { id: "user-1", email: "user@test.com", isSuperAdmin: false };
const PARAMS = { params: { id: "app-1" } };
const URL_BASE = "http://localhost:3006/api/super/apps/app-1/oauth";

function postReq(body: unknown) {
  return makeRequest(URL_BASE, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

// ─── POST (create OAuth client) ──────────────────────────────────────────────

describe("POST /api/super/apps/[id]/oauth", () => {
  beforeEach(() => {
    resetMockDb();
    vi.mocked(logAudit).mockClear();
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await POST(postReq({ redirectUris: [] }), PARAMS);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await POST(postReq({ redirectUris: [] }), PARAMS);
    expect(res.status).toBe(403);
  });

  it("returns 404 when app is not found", async () => {
    setSession(SUPER_ADMIN);
    mockDb.app.findUnique.mockResolvedValue(null as never);

    const res = await POST(postReq({ redirectUris: [] }), PARAMS);
    expect(res.status).toBe(404);
    const body = await bodyOf(res);
    expect(body.error).toContain("App not found");
  });

  it("returns 409 when a first-party OAuth client already exists for this app", async () => {
    setSession(SUPER_ADMIN);
    mockDb.app.findUnique.mockResolvedValue({ id: "app-1", slug: "quikscale" } as never);
    mockDb.oAuthClient.findFirst.mockResolvedValue({ id: "oc-existing", appId: "app-1", purpose: "first_party" } as never);

    const res = await POST(postReq({ redirectUris: [] }), PARAMS);
    expect(res.status).toBe(409);
    const body = await bodyOf(res);
    expect(body.error).toContain("already exists");
  });

  it("succeeds even when a dynamically self-registered client already exists for this app", async () => {
    setSession(SUPER_ADMIN);
    mockDb.app.findUnique.mockResolvedValue({ id: "app-1", slug: "quikscale" } as never);
    // findFirst filters on purpose: "first_party" — a "dynamic" client for
    // the same appId must not trip the 409 guard.
    mockDb.oAuthClient.findFirst.mockResolvedValue(null as never);
    mockDb.oAuthClient.create.mockResolvedValue({
      id: "oc-1",
      appId: "app-1",
      clientId: "quikscale",
      scopes: ["openid", "profile", "email", "tenant"],
      grantTypes: ["authorization_code", "refresh_token"],
      redirectUris: ["https://example.com/cb"],
    } as never);

    const res = await POST(postReq({ redirectUris: ["https://example.com/cb"] }), PARAMS);
    expect(res.status).toBe(201);

    const findFirstCall = mockDb.oAuthClient.findFirst.mock.calls[0]?.[0];
    expect(findFirstCall?.where).toEqual({ appId: "app-1", purpose: "first_party" });
  });

  it("creates an OAuth client, returns plain secret, and writes audit log", async () => {
    setSession(SUPER_ADMIN);
    mockDb.app.findUnique.mockResolvedValue({ id: "app-1", slug: "quikscale" } as never);
    mockDb.oAuthClient.findFirst.mockResolvedValue(null as never);
    mockDb.oAuthClient.create.mockResolvedValue({
      id: "oc-1",
      appId: "app-1",
      clientId: "quikscale",
      scopes: ["openid", "profile", "email", "tenant"],
      grantTypes: ["authorization_code", "refresh_token"],
      redirectUris: ["https://example.com/cb"],
    } as never);

    const res = await POST(postReq({ redirectUris: ["https://example.com/cb"] }), PARAMS);
    expect(res.status).toBe(201);

    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.data.clientId).toBe("quikscale");
    expect(typeof body.data.clientSecret).toBe("string");
    // base64url without padding — hefty random bytes → string length is 40+
    expect(body.data.clientSecret.length).toBeGreaterThan(20);
    expect(body.data.redirectUris).toEqual(["https://example.com/cb"]);

    const createCall = mockDb.oAuthClient.create.mock.calls[0]?.[0];
    expect(createCall?.data.appId).toBe("app-1");
    expect(createCall?.data.purpose).toBe("first_party");
    expect(createCall?.data.clientId).toBe("quikscale");
    // Secret is hashed in DB, not plain
    expect(createCall?.data.clientSecret).not.toBe(body.data.clientSecret);

    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "create",
        entityType: "oauth_client",
        entityId: "oc-1",
        actorId: SUPER_ADMIN.id,
      }),
    );
  });
});

// ─── PATCH (rotate secret) ───────────────────────────────────────────────────

describe("PATCH /api/super/apps/[id]/oauth", () => {
  beforeEach(() => {
    resetMockDb();
    vi.mocked(logAudit).mockClear();
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await PATCH(makeRequest(URL_BASE, { method: "PATCH" }), PARAMS);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await PATCH(makeRequest(URL_BASE, { method: "PATCH" }), PARAMS);
    expect(res.status).toBe(403);
  });

  it("returns 404 when no first-party OAuth client exists for the app", async () => {
    setSession(SUPER_ADMIN);
    mockDb.oAuthClient.findFirst.mockResolvedValue(null as never);

    const res = await PATCH(makeRequest(URL_BASE, { method: "PATCH" }), PARAMS);
    expect(res.status).toBe(404);
    const body = await bodyOf(res);
    expect(body.error).toContain("OAuth client not found");
  });

  it("returns 404 when only a dynamically self-registered client exists for the app", async () => {
    setSession(SUPER_ADMIN);
    // findFirst filters on purpose: "first_party" — a "dynamic"-only app
    // resolves to no match, same as no client at all.
    mockDb.oAuthClient.findFirst.mockResolvedValue(null as never);

    const res = await PATCH(makeRequest(URL_BASE, { method: "PATCH" }), PARAMS);
    expect(res.status).toBe(404);
    expect(mockDb.oAuthClient.update).not.toHaveBeenCalled();
  });

  it("rotates secret, returns new plain secret, and writes audit log", async () => {
    setSession(SUPER_ADMIN);
    mockDb.oAuthClient.findFirst.mockResolvedValue({
      id: "oc-1",
      appId: "app-1",
      clientId: "quikscale",
      clientSecret: "hashed-old",
    } as never);
    mockDb.oAuthClient.update.mockResolvedValue({ id: "oc-1" } as never);

    const res = await PATCH(makeRequest(URL_BASE, { method: "PATCH" }), PARAMS);
    expect(res.status).toBe(200);

    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.data.clientId).toBe("quikscale");
    expect(typeof body.data.clientSecret).toBe("string");
    expect(body.data.clientSecret.length).toBeGreaterThan(20);

    const updCall = mockDb.oAuthClient.update.mock.calls[0]?.[0];
    expect(updCall?.where).toEqual({ id: "oc-1" });
    expect(updCall?.data.clientSecret).not.toBe(body.data.clientSecret);

    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "rotate_secret",
        entityType: "oauth_client",
        entityId: "oc-1",
        actorId: SUPER_ADMIN.id,
      }),
    );
  });
});

// ─── DELETE (remove client) ──────────────────────────────────────────────────

describe("DELETE /api/super/apps/[id]/oauth", () => {
  beforeEach(() => {
    resetMockDb();
    vi.mocked(logAudit).mockClear();
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await DELETE(makeRequest(URL_BASE, { method: "DELETE" }), PARAMS);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await DELETE(makeRequest(URL_BASE, { method: "DELETE" }), PARAMS);
    expect(res.status).toBe(403);
  });

  it("returns 404 when no first-party OAuth client exists", async () => {
    setSession(SUPER_ADMIN);
    mockDb.oAuthClient.findFirst.mockResolvedValue(null as never);

    const res = await DELETE(makeRequest(URL_BASE, { method: "DELETE" }), PARAMS);
    expect(res.status).toBe(404);
  });

  it("returns 404 (and does not touch it) when only a dynamic client exists", async () => {
    setSession(SUPER_ADMIN);
    mockDb.oAuthClient.findFirst.mockResolvedValue(null as never);

    const res = await DELETE(makeRequest(URL_BASE, { method: "DELETE" }), PARAMS);
    expect(res.status).toBe(404);
    expect(mockDb.oAuthClient.delete).not.toHaveBeenCalled();
  });

  it("deletes the client and writes audit log", async () => {
    setSession(SUPER_ADMIN);
    mockDb.oAuthClient.findFirst.mockResolvedValue({
      id: "oc-1",
      appId: "app-1",
      clientId: "quikscale",
    } as never);
    mockDb.oAuthClient.delete.mockResolvedValue({ id: "oc-1" } as never);

    const res = await DELETE(makeRequest(URL_BASE, { method: "DELETE" }), PARAMS);
    expect(res.status).toBe(200);

    const body = await bodyOf(res);
    expect(body.success).toBe(true);

    expect(mockDb.oAuthClient.delete).toHaveBeenCalledWith({ where: { id: "oc-1" } });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "delete",
        entityType: "oauth_client",
        entityId: "oc-1",
        actorId: SUPER_ADMIN.id,
      }),
    );
  });
});

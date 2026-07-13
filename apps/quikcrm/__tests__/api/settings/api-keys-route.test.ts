/**
 * Tests for the admin API-key management routes (Settings → API Keys).
 *
 * Seam: mockDb mocks @/lib/db, @/lib/db/prisma, and @/lib/auth/permissions
 * (assertModule). requirePermission is NOT mocked — the route's real
 * requirePermission runs and awaits the MOCKED assertModule (Administrator
 * bypasses it; non-admins hit it). `$transaction` is mocked to invoke the
 * callback with the db mock as the tx client.
 *
 * Covers, per app CLAUDE.md testing rules: 401 unauthenticated, 403 non-admin
 * without the settings permission, org-isolation on queries, the one-time
 * secret visibility contract, and the invariant that keyHash is never returned.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";
import { assertModule } from "@/lib/auth/permissions";
import { hashApiKey } from "@/lib/api/public-api-auth";

const db = mockDb();

function runsTxCallbackWithDb() {
  db.$transaction.mockImplementation(async (fn: unknown) => {
    if (typeof fn === "function") return (fn as (tx: typeof db) => unknown)(db);
    return [];
  });
}

const ADMIN = { userId: "u1", orgId: "t1", role: "Administrator", email: "admin@x.co", name: "Admin User" };

beforeEach(() => {
  setSession(null);
  vi.mocked(assertModule).mockReset();
  vi.mocked(assertModule).mockResolvedValue(undefined);
  db.$transaction.mockReset();
  db.crmApiKey.findMany.mockReset();
  db.crmApiKey.findFirst.mockReset();
  db.crmApiKey.create.mockReset();
  db.crmApiKey.update.mockReset();
  db.crmApiKey.delete.mockReset();
  db.crmAuditLog.create.mockReset();
  db.user.findMany.mockReset();
  db.user.findMany.mockResolvedValue([] as never);
  db.crmAuditLog.create.mockResolvedValue({} as never);
});

describe("GET /api/settings/api-keys", () => {
  it("returns 401 when unauthenticated", async () => {
    const { GET } = await import("@/app/api/settings/api-keys/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin lacking the settings permission", async () => {
    setSession({ userId: "u2", orgId: "t1", role: "SalesUser", email: "rep@x.co", name: "Rep" });
    vi.mocked(assertModule).mockRejectedValue(
      Object.assign(new Error("Forbidden"), { statusCode: 403 }),
    );
    const { GET } = await import("@/app/api/settings/api-keys/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("lists keys scoped to the org and never leaks keyHash", async () => {
    setSession(ADMIN);
    db.crmApiKey.findMany.mockResolvedValue([
      {
        id: "k1",
        name: "Dashboard",
        prefix: "qcrm_",
        lastFour: "abcd",
        isActive: true,
        createdAt: new Date("2026-06-01T00:00:00Z"),
        lastUsedAt: null,
        revokedAt: null,
        createdByUserId: "u1",
      },
    ] as never);
    db.user.findMany.mockResolvedValue([
      { id: "u1", firstName: "Admin", lastName: "User" },
    ] as never);

    const { GET } = await import("@/app/api/settings/api-keys/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();

    // Org isolation: findMany is scoped to the session org.
    expect(db.crmApiKey.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: "t1" } }),
    );
    // Never expose the hash.
    expect(JSON.stringify(body)).not.toContain("keyHash");
    expect(body.items[0]).toMatchObject({
      id: "k1",
      status: "active",
      createdByName: "Admin User",
    });
    expect(body.items[0].keyHash).toBeUndefined();
  });
});

describe("POST /api/settings/api-keys (create + one-time secret)", () => {
  it("returns 400 when name is missing", async () => {
    setSession(ADMIN);
    const { POST } = await import("@/app/api/settings/api-keys/route");
    const req = new Request("http://test/api/settings/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(400);
  });

  it("returns 409 on a duplicate name", async () => {
    setSession(ADMIN);
    db.crmApiKey.findFirst.mockResolvedValue({ id: "existing" } as never);
    const { POST } = await import("@/app/api/settings/api-keys/route");
    const req = new Request("http://test/api/settings/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Dashboard" }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(409);
  });

  it("creates a key, returns the raw secret exactly once, and stores only its hash", async () => {
    setSession(ADMIN);
    runsTxCallbackWithDb();
    db.crmApiKey.findFirst.mockResolvedValue(null as never); // no dupe
    db.crmApiKey.create.mockResolvedValue({
      id: "k_new",
      name: "Dashboard",
      prefix: "qcrm_",
      lastFour: "1234",
      isActive: true,
      createdAt: new Date("2026-07-03T00:00:00Z"),
      lastUsedAt: null,
      revokedAt: null,
      createdByUserId: "u1",
    } as never);
    db.user.findMany.mockResolvedValue([
      { id: "u1", firstName: "Admin", lastName: "User" },
    ] as never);

    const { POST } = await import("@/app/api/settings/api-keys/route");
    const req = new Request("http://test/api/settings/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Dashboard" }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(201);
    const body = await res.json();

    // One-time secret is present on create...
    expect(typeof body.rawKey).toBe("string");
    expect(body.rawKey).toMatch(/^qcrm_[0-9a-f]+$/);

    // ...and what got persisted is the HASH of that raw key, never the raw key.
    const createArg = db.crmApiKey.create.mock.calls[0][0];
    expect(createArg.data.keyHash).toBe(hashApiKey(body.rawKey));
    expect(createArg.data.orgId).toBe("t1");
    expect(JSON.stringify(createArg.data)).not.toContain(body.rawKey);

    // The returned view object must not contain the raw key or the hash.
    expect(JSON.stringify(body.apiKey)).not.toContain(body.rawKey);
    expect(JSON.stringify(body.apiKey)).not.toContain("keyHash");

    // An audit entry was written and it does NOT contain the raw key or hash.
    expect(db.crmAuditLog.create).toHaveBeenCalled();
    const auditArg = db.crmAuditLog.create.mock.calls[0][0];
    expect(auditArg.data.module).toBe("api-keys");
    expect(auditArg.data.action).toBe("create");
    expect(JSON.stringify(auditArg)).not.toContain(body.rawKey);
    expect(JSON.stringify(auditArg)).not.toContain(hashApiKey(body.rawKey));
  });
});

describe("PATCH /api/settings/api-keys/[id] (revoke / activate)", () => {
  it("revokes an active key (scoped to org) and audits it", async () => {
    setSession(ADMIN);
    runsTxCallbackWithDb();
    db.crmApiKey.findFirst.mockResolvedValue({
      id: "k1", name: "D", prefix: "qcrm_", lastFour: "1234",
      isActive: true, createdAt: new Date(), lastUsedAt: null, revokedAt: null, createdByUserId: "u1",
    } as never);
    db.crmApiKey.update.mockResolvedValue({
      id: "k1", name: "D", prefix: "qcrm_", lastFour: "1234",
      isActive: false, createdAt: new Date(), lastUsedAt: null, revokedAt: new Date(), createdByUserId: "u1",
    } as never);

    const { PATCH } = await import("@/app/api/settings/api-keys/[id]/route");
    const req = new Request("http://test/api/settings/api-keys/k1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "revoke" }),
    });
    const res = await PATCH(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "k1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.apiKey.status).toBe("revoked");

    // Org isolation on the lookup.
    expect(db.crmApiKey.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "k1", orgId: "t1" } }),
    );
    // Revoking sets revokedAt.
    const updArg = db.crmApiKey.update.mock.calls[0][0];
    expect(updArg.data.isActive).toBe(false);
    expect(updArg.data.revokedAt).toBeInstanceOf(Date);
  });

  it("reactivating clears revokedAt", async () => {
    setSession(ADMIN);
    runsTxCallbackWithDb();
    db.crmApiKey.findFirst.mockResolvedValue({
      id: "k1", name: "D", prefix: "qcrm_", lastFour: "1234",
      isActive: false, createdAt: new Date(), lastUsedAt: null, revokedAt: new Date(), createdByUserId: "u1",
    } as never);
    db.crmApiKey.update.mockResolvedValue({
      id: "k1", name: "D", prefix: "qcrm_", lastFour: "1234",
      isActive: true, createdAt: new Date(), lastUsedAt: null, revokedAt: null, createdByUserId: "u1",
    } as never);

    const { PATCH } = await import("@/app/api/settings/api-keys/[id]/route");
    const req = new Request("http://test/api/settings/api-keys/k1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "activate" }),
    });
    const res = await PATCH(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "k1" }),
    });
    expect(res.status).toBe(200);
    const updArg = db.crmApiKey.update.mock.calls[0][0];
    expect(updArg.data.isActive).toBe(true);
    expect(updArg.data.revokedAt).toBeNull();
  });

  it("returns 404 for a key in another org", async () => {
    setSession(ADMIN);
    runsTxCallbackWithDb();
    db.crmApiKey.findFirst.mockResolvedValue(null as never); // not found in this org
    const { PATCH } = await import("@/app/api/settings/api-keys/[id]/route");
    const req = new Request("http://test/api/settings/api-keys/other", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "revoke" }),
    });
    const res = await PATCH(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "other" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 for an invalid action", async () => {
    setSession(ADMIN);
    const { PATCH } = await import("@/app/api/settings/api-keys/[id]/route");
    const req = new Request("http://test/api/settings/api-keys/k1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "explode" }),
    });
    const res = await PATCH(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "k1" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/settings/api-keys/[id]", () => {
  it("deletes a key scoped to the org and audits it", async () => {
    setSession(ADMIN);
    runsTxCallbackWithDb();
    db.crmApiKey.findFirst.mockResolvedValue({
      id: "k1", name: "D", prefix: "qcrm_", lastFour: "1234",
      isActive: true, createdAt: new Date(), lastUsedAt: null, revokedAt: null, createdByUserId: "u1",
    } as never);
    db.crmApiKey.delete.mockResolvedValue({} as never);

    const { DELETE } = await import("@/app/api/settings/api-keys/[id]/route");
    const req = new Request("http://test/api/settings/api-keys/k1", { method: "DELETE" });
    const res = await DELETE(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "k1" }),
    });
    expect(res.status).toBe(200);
    expect(db.crmApiKey.delete).toHaveBeenCalledWith({ where: { id: "k1" } });
    expect(db.crmAuditLog.create).toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    const { DELETE } = await import("@/app/api/settings/api-keys/[id]/route");
    const req = new Request("http://test/api/settings/api-keys/k1", { method: "DELETE" });
    const res = await DELETE(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "k1" }),
    });
    expect(res.status).toBe(401);
  });
});

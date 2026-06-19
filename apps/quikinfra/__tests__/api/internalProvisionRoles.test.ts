import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resetMockDb } from "../helpers/mockDb";
import { NextRequest } from "next/server";

// Guarded by a shared INTERNAL_SECRET header (service-to-service), NOT a user
// session. The role seeder talks to the DB through several models, so we mock
// the seeder module directly rather than reproduce its query graph.
const seedDefaultRoles = vi.fn();
const ensureUserOnRole = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/rbac/seedDefaultRoles", () => ({
  seedDefaultRoles: (...a: unknown[]) => seedDefaultRoles(...a),
  ensureUserOnRole: (...a: unknown[]) => ensureUserOnRole(...a),
}));

const { POST } = await import("@/app/api/internal/provision-roles/route");

const SECRET = "super-secret-internal";

function req(body: unknown, secret?: string): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret !== undefined) headers["x-internal-secret"] = secret;
  return new NextRequest("http://localhost/api/internal/provision-roles", {
    method: "POST",
    body: JSON.stringify(body),
    headers,
  });
}

const SEEDED = {
  adminRoleId: "role-admin",
  hoUserRoleId: "role-ho",
  siteAdminRoleId: "role-site",
  userRoleId: "role-user",
};

beforeEach(() => {
  resetMockDb();
  seedDefaultRoles.mockReset();
  ensureUserOnRole.mockReset().mockResolvedValue(undefined);
  process.env.INTERNAL_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.INTERNAL_SECRET;
});

describe("POST /api/internal/provision-roles — secret guard", () => {
  it("returns 401 when the x-internal-secret header is missing", async () => {
    const res = await POST(req({ orgId: "org-1" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when the secret does not match", async () => {
    const res = await POST(req({ orgId: "org-1" }, "wrong"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when INTERNAL_SECRET is not configured server-side", async () => {
    delete process.env.INTERNAL_SECRET;
    const res = await POST(req({ orgId: "org-1" }, SECRET));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/internal/provision-roles — validation", () => {
  it("returns 400 when orgId is missing", async () => {
    const res = await POST(req({}, SECRET));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/orgId/i);
  });
});

describe("POST /api/internal/provision-roles — happy path", () => {
  it("seeds the org roles and returns the seeded role ids", async () => {
    seedDefaultRoles.mockResolvedValue(SEEDED);
    const res = await POST(req({ orgId: "org-1" }, SECRET));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.adminRoleId).toBe("role-admin");
    expect(seedDefaultRoles).toHaveBeenCalledWith("org-1");
    expect(ensureUserOnRole).not.toHaveBeenCalled();
  });

  it("assigns supplied adminUserIds to the seeded admin role", async () => {
    seedDefaultRoles.mockResolvedValue(SEEDED);
    const res = await POST(
      req({ orgId: "org-1", adminUserIds: ["u1", "u2", ""] }, SECRET),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.assignedAdminUserIds).toEqual(["u1", "u2"]);
    expect(ensureUserOnRole).toHaveBeenCalledTimes(2);
    expect(ensureUserOnRole).toHaveBeenCalledWith("u1", "org-1", "role-admin");
  });

  it("returns 500 when the seeder cannot resolve roles (returns null)", async () => {
    seedDefaultRoles.mockResolvedValue(null);
    const res = await POST(req({ orgId: "org-1" }, SECRET));
    expect(res.status).toBe(500);
    expect((await res.json()).success).toBe(false);
  });

  it("returns 500 when the seeder throws", async () => {
    seedDefaultRoles.mockRejectedValue(new Error("db exploded"));
    const res = await POST(req({ orgId: "org-1" }, SECRET));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/db exploded/);
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { TEST_TENANT } from "../setup";
import { NextRequest, NextResponse } from "next/server";

// org/roles/[id] + org/roles/[id]/permissions — admin-only, gated via
// requireAdmin(). Same mock contract as orgRoles.test.ts. The [id] route also
// calls assertRoleDeletable() from preventAdminLockout — we mock that module so
// DELETE behaviour (system-role protection, member-count gate) is driven from
// the test. permissions PUT validates pairs against the REAL permissionsRegistry.
type AdminState =
  | { error: NextResponse }
  | { orgId: string; userId: string }
  | null;
const _admin: { state: AdminState } = { state: null };
function setAdmin(state: AdminState) {
  _admin.state = state;
}
const unauthorized = () =>
  NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
const forbidden = () =>
  NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

vi.mock("@/lib/rbac/requireAdmin", () => ({
  requireAdmin: vi.fn(async () => {
    if (!_admin.state) return { error: unauthorized() };
    return _admin.state;
  }),
}));

class AdminLockoutError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "AdminLockoutError";
    this.code = code;
  }
}
const _lockout: { assertRoleDeletable: (a: unknown) => Promise<unknown> } = {
  assertRoleDeletable: async () => ({ memberCount: 0 }),
};
vi.mock("@/lib/rbac/preventAdminLockout", () => ({
  AdminLockoutError,
  assertRoleDeletable: (a: unknown) => _lockout.assertRoleDeletable(a),
}));

const db = mockDb as any;

const idRoute = await import("@/app/api/org/roles/[id]/route");
const permRoute = await import("@/app/api/org/roles/[id]/permissions/route");

const params = (id: string) => ({ params: { id } });

function jsonReq(method: string, body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/org/roles/r1", {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  });
}

beforeEach(() => {
  resetMockDb();
  setAdmin(null);
  _lockout.assertRoleDeletable = async () => ({ memberCount: 0 });
});

// ═══════════════════════════════════════════════
// GET /api/org/roles/[id]
// ═══════════════════════════════════════════════

describe("GET /api/org/roles/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = (await idRoute.GET(jsonReq("GET"), params("r1")))!;
    expect(res.status).toBe(401);
  });

  it("returns 403 when not admin", async () => {
    setAdmin({ error: forbidden() });
    const res = (await idRoute.GET(jsonReq("GET"), params("r1")))!;
    expect(res.status).toBe(403);
  });

  it("returns 404 when the role is not in the caller's org", async () => {
    setAdmin({ orgId: TEST_TENANT, userId: "u1" });
    db.cnAppRole.findFirst.mockResolvedValue(null);
    const res = (await idRoute.GET(jsonReq("GET"), params("r1")))!;
    expect(res.status).toBe(404);
    const where = db.cnAppRole.findFirst.mock.calls[0][0].where;
    expect(where.orgId).toBe(TEST_TENANT);
    expect(where.id).toBe("r1");
  });

  it("returns role detail with counts", async () => {
    setAdmin({ orgId: TEST_TENANT, userId: "u1" });
    db.cnAppRole.findFirst.mockResolvedValue({
      id: "r1",
      name: "Viewer",
      description: null,
      isSystem: false,
      isDefault: true,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      _count: { members: 3, rolePermissions: 5 },
    });
    const res = (await idRoute.GET(jsonReq("GET"), params("r1")))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.memberCount).toBe(3);
    expect(body.data.permissionCount).toBe(5);
  });
});

// ═══════════════════════════════════════════════
// PATCH /api/org/roles/[id]
// ═══════════════════════════════════════════════

describe("PATCH /api/org/roles/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = (await idRoute.PATCH(jsonReq("PATCH", { name: "x" }), params("r1")))!;
    expect(res.status).toBe(401);
  });

  it("returns 404 when the role is missing", async () => {
    setAdmin({ orgId: TEST_TENANT, userId: "u1" });
    db.cnAppRole.findFirst.mockResolvedValue(null);
    const res = (await idRoute.PATCH(jsonReq("PATCH", { name: "x" }), params("r1")))!;
    expect(res.status).toBe(404);
  });

  it("refuses to rename a system role (403)", async () => {
    setAdmin({ orgId: TEST_TENANT, userId: "u1" });
    db.cnAppRole.findFirst.mockResolvedValue({ id: "r1", isSystem: true, name: "admin" });
    const res = (await idRoute.PATCH(jsonReq("PATCH", { name: "superadmin" }), params("r1")))!;
    expect(res.status).toBe(403);
  });

  it("renames a non-system role and demotes other defaults when set default", async () => {
    setAdmin({ orgId: TEST_TENANT, userId: "u1" });
    db.cnAppRole.findFirst.mockResolvedValue({ id: "r1", isSystem: false, name: "Viewer" });
    db.cnAppRole.updateMany.mockResolvedValue({ count: 1 });
    db.cnAppRole.update.mockResolvedValue({
      id: "r1",
      name: "Reader",
      description: null,
      isSystem: false,
      isDefault: true,
    });
    const res = (await idRoute.PATCH(
      jsonReq("PATCH", { name: "Reader", isDefault: true }),
      params("r1"),
    ))!;
    expect(res.status).toBe(200);
    expect((await res.json()).data.name).toBe("Reader");
    // other defaults demoted, scoped to org
    const dwhere = db.cnAppRole.updateMany.mock.calls[0][0].where;
    expect(dwhere.orgId).toBe(TEST_TENANT);
    expect(dwhere.isDefault).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// DELETE /api/org/roles/[id]
// ═══════════════════════════════════════════════

describe("DELETE /api/org/roles/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = (await idRoute.DELETE(jsonReq("DELETE"), params("r1")))!;
    expect(res.status).toBe(401);
  });

  it("deletes a deletable role", async () => {
    setAdmin({ orgId: TEST_TENANT, userId: "u1" });
    db.cnAppRole.delete.mockResolvedValue({ id: "r1" });
    const res = (await idRoute.DELETE(jsonReq("DELETE"), params("r1")))!;
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(db.cnAppRole.delete.mock.calls[0][0].where.id).toBe("r1");
  });

  it("maps SYSTEM_ROLE_PROTECTED lockout to 409", async () => {
    setAdmin({ orgId: TEST_TENANT, userId: "u1" });
    _lockout.assertRoleDeletable = async () => {
      throw new AdminLockoutError("System roles cannot be deleted.", "SYSTEM_ROLE_PROTECTED");
    };
    const res = (await idRoute.DELETE(jsonReq("DELETE"), params("r1")))!;
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("SYSTEM_ROLE_PROTECTED");
  });

  it("maps NOT_FOUND lockout to 404", async () => {
    setAdmin({ orgId: TEST_TENANT, userId: "u1" });
    _lockout.assertRoleDeletable = async () => {
      throw new AdminLockoutError("Role not found.", "NOT_FOUND");
    };
    const res = (await idRoute.DELETE(jsonReq("DELETE"), params("r1")))!;
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════
// GET /api/org/roles/[id]/permissions
// ═══════════════════════════════════════════════

describe("GET /api/org/roles/[id]/permissions", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = (await permRoute.GET(jsonReq("GET"), params("r1")))!;
    expect(res.status).toBe(401);
  });

  it("returns 404 when role missing", async () => {
    setAdmin({ orgId: TEST_TENANT, userId: "u1" });
    db.cnAppRole.findFirst.mockResolvedValue(null);
    const res = (await permRoute.GET(jsonReq("GET"), params("r1")))!;
    expect(res.status).toBe(404);
  });

  it("returns the role's current permission pairs", async () => {
    setAdmin({ orgId: TEST_TENANT, userId: "u1" });
    db.cnAppRole.findFirst.mockResolvedValue({ id: "r1" });
    db.cnRolePermissionV2.findMany.mockResolvedValue([
      { resource: "construction.boq", action: "view" },
    ]);
    const res = (await permRoute.GET(jsonReq("GET"), params("r1")))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.permissions).toHaveLength(1);
    expect(db.cnRolePermissionV2.findMany.mock.calls[0][0].where.roleId).toBe("r1");
  });
});

// ═══════════════════════════════════════════════
// PUT /api/org/roles/[id]/permissions
// ═══════════════════════════════════════════════

describe("PUT /api/org/roles/[id]/permissions", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = (await permRoute.PUT(
      jsonReq("PUT", { permissions: [] }),
      params("r1"),
    ))!;
    expect(res.status).toBe(401);
  });

  it("returns 404 when role missing", async () => {
    setAdmin({ orgId: TEST_TENANT, userId: "u1" });
    db.cnAppRole.findFirst.mockResolvedValue(null);
    const res = (await permRoute.PUT(jsonReq("PUT", { permissions: [] }), params("r1")))!;
    expect(res.status).toBe(404);
  });

  it("returns 400 when permissions[] is not an array", async () => {
    setAdmin({ orgId: TEST_TENANT, userId: "u1" });
    db.cnAppRole.findFirst.mockResolvedValue({ id: "r1" });
    const res = (await permRoute.PUT(jsonReq("PUT", { permissions: "nope" }), params("r1")))!;
    expect(res.status).toBe(400);
  });

  it("returns 400 on an unknown (resource, action) pair", async () => {
    setAdmin({ orgId: TEST_TENANT, userId: "u1" });
    db.cnAppRole.findFirst.mockResolvedValue({ id: "r1" });
    const res = (await permRoute.PUT(
      jsonReq("PUT", { permissions: [{ resource: "construction.boq", action: "teleport" }] }),
      params("r1"),
    ))!;
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/unknown permission/i);
  });

  it("returns 400 when a pair is malformed (non-string action)", async () => {
    setAdmin({ orgId: TEST_TENANT, userId: "u1" });
    db.cnAppRole.findFirst.mockResolvedValue({ id: "r1" });
    const res = (await permRoute.PUT(
      jsonReq("PUT", { permissions: [{ resource: "construction.boq", action: 5 }] }),
      params("r1"),
    ))!;
    expect(res.status).toBe(400);
  });

  it("replaces the matrix atomically with valid pairs", async () => {
    setAdmin({ orgId: TEST_TENANT, userId: "u1" });
    db.cnAppRole.findFirst.mockResolvedValue({ id: "r1" });
    db.$transaction.mockResolvedValue([{ count: 0 }, { count: 2 }]);
    const res = (await permRoute.PUT(
      jsonReq("PUT", {
        permissions: [
          { resource: "construction.boq", action: "view" },
          { resource: "construction.boq", action: "edit" },
        ],
      }),
      params("r1"),
    ))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.permissions).toHaveLength(2);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
});

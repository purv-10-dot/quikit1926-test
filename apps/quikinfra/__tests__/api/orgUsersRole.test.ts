import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest, NextResponse } from "next/server";

// PATCH /api/org/users/[id]/role — single-role swap, admin-only via
// requireAdmin(). Calls assertWouldNotEmptyAdmin() (mocked) before writing.
// On success it deletes existing CnUserAppRole rows + creates the new one in a
// $transaction, then reconciles settings CnUserPermissionExtra rows.
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
const _lockout: { assertWouldNotEmptyAdmin: (a: unknown) => Promise<void> } = {
  assertWouldNotEmptyAdmin: async () => {},
};
vi.mock("@/lib/rbac/preventAdminLockout", () => ({
  AdminLockoutError,
  assertWouldNotEmptyAdmin: (a: unknown) => _lockout.assertWouldNotEmptyAdmin(a),
}));

const db = mockDb as any;

const { PATCH } = await import("@/app/api/org/users/[id]/role/route");

const params = (id: string) => ({ params: { id } });
function reqPATCH(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/org/users/u-target/role", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  resetMockDb();
  setAdmin(null);
  _lockout.assertWouldNotEmptyAdmin = async () => {};
});

describe("PATCH /api/org/users/[id]/role", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = (await PATCH(reqPATCH({ roleId: "r1" }), params("u-target")))!;
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not an admin", async () => {
    setAdmin({ error: forbidden() });
    const res = (await PATCH(reqPATCH({ roleId: "r1" }), params("u-target")))!;
    expect(res.status).toBe(403);
  });

  it("returns 400 when roleId is missing", async () => {
    setAdmin({ orgId: TEST_TENANT, userId: TEST_USER });
    const res = (await PATCH(reqPATCH({}), params("u-target")))!;
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/roleId is required/i);
  });

  it("returns 404 when the target role is not in this org", async () => {
    setAdmin({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnAppRole.findFirst.mockResolvedValue(null);
    const res = (await PATCH(reqPATCH({ roleId: "r1" }), params("u-target")))!;
    expect(res.status).toBe(404);
    const where = db.cnAppRole.findFirst.mock.calls[0][0].where;
    expect(where.id).toBe("r1");
    expect(where.orgId).toBe(TEST_TENANT);
  });

  it("maps an admin-lockout to 409", async () => {
    setAdmin({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnAppRole.findFirst.mockResolvedValue({ id: "r1", name: "Viewer", isSystem: false });
    _lockout.assertWouldNotEmptyAdmin = async () => {
      throw new AdminLockoutError("Cannot remove the last administrator.", "LAST_ADMIN");
    };
    const res = (await PATCH(reqPATCH({ roleId: "r1" }), params("u-target")))!;
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("LAST_ADMIN");
  });

  it("swaps the role (delete+create in a txn) and strips settings extras for a non-admin role", async () => {
    setAdmin({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnAppRole.findFirst.mockResolvedValue({ id: "r1", name: "Viewer", isSystem: false });
    db.$transaction.mockResolvedValue([{ count: 1 }, { id: "ua1" }]);
    db.cnUserPermissionExtra.deleteMany.mockResolvedValue({ count: 0 });

    const res = (await PATCH(
      reqPATCH({ roleId: "r1", enableSettings: true }),
      params("u-target"),
    ))!;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.userId).toBe("u-target");
    expect(body.data.roleId).toBe("r1");
    // non-admin role → no settings access regardless of the checkbox
    expect(body.data.settingsAccess).toBe(false);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    // extras stripped, scoped to org + target user
    const where = db.cnUserPermissionExtra.deleteMany.mock.calls[0][0].where;
    expect(where.orgId).toBe(TEST_TENANT);
    expect(where.userId).toBe("u-target");
  });

  it("grants settings extras when role is admin AND enableSettings is true", async () => {
    setAdmin({ orgId: TEST_TENANT, userId: TEST_USER });
    db.cnAppRole.findFirst.mockResolvedValue({ id: "r-admin", name: "admin", isSystem: true });
    db.$transaction.mockResolvedValue([{ count: 1 }, { id: "ua1" }]);
    db.cnUserPermissionExtra.upsert.mockResolvedValue({ id: "x" });

    const res = (await PATCH(
      reqPATCH({ roleId: "r-admin", enableSettings: true }),
      params("u-target"),
    ))!;
    expect(res.status).toBe(200);
    expect((await res.json()).data.settingsAccess).toBe(true);
    // 4 settings extras upserted
    expect(db.cnUserPermissionExtra.upsert).toHaveBeenCalledTimes(4);
  });
});

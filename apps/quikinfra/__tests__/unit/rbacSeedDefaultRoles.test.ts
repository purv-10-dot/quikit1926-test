import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";

// seedDefaultRoles transitively imports userCan, whose module body calls
// React's `cache()` — unavailable in node test env. Stub to passthrough.
vi.mock("react", async () => {
  const actual = await vi.importActual<any>("react");
  return { ...actual, cache: (fn: any) => fn };
});

import { seedDefaultRoles, ensureUserOnRole } from "@/lib/rbac/seedDefaultRoles";

const db = mockDb as any;

// NOTE: seedDefaultRoles keeps an in-process cache keyed by orgId that
// survives resetMockDb(). Each test uses a UNIQUE orgId so a prior test's
// cache entry never short-circuits the path under test.
let orgCounter = 0;
function freshOrg(): string {
  orgCounter += 1;
  return `org-seed-${orgCounter}-${Date.now()}`;
}

beforeEach(() => {
  resetMockDb();
  db.app.findUnique.mockResolvedValue({ id: "app-1" });
});

describe("seedDefaultRoles — fresh org", () => {
  it("upserts the 4 system roles and backfills missing grants", async () => {
    const orgId = freshOrg();
    // upsert returns a distinct id per role name
    db.cnAppRole.upsert.mockImplementation(async (args: any) =>
      ({ id: `role-${args.where.orgId_appId_name.name}` }),
    );
    // no existing grants → everything is "missing"
    db.cnRolePermissionV2.findMany.mockResolvedValue([]);
    db.cnRolePermissionV2.createMany.mockResolvedValue({ count: 1 });

    const result = await seedDefaultRoles(orgId);

    expect(result).toEqual({
      adminRoleId: "role-admin",
      hoUserRoleId: "role-ho_user",
      siteAdminRoleId: "role-site_admin",
      userRoleId: "role-user",
    });
    // 4 roles upserted
    expect(db.cnAppRole.upsert).toHaveBeenCalledTimes(4);
    const upsertedNames = db.cnAppRole.upsert.mock.calls.map(
      (c: any) => c[0].where.orgId_appId_name.name,
    );
    expect(upsertedNames.sort()).toEqual(["admin", "ho_user", "site_admin", "user"]);

    // admin role is created with isSystem true; user role is isDefault true
    const adminCreate = db.cnAppRole.upsert.mock.calls.find(
      (c: any) => c[0].where.orgId_appId_name.name === "admin",
    )[0].create;
    expect(adminCreate.isSystem).toBe(true);
    expect(adminCreate.isDefault).toBe(false);
    const userCreate = db.cnAppRole.upsert.mock.calls.find(
      (c: any) => c[0].where.orgId_appId_name.name === "user",
    )[0].create;
    expect(userCreate.isDefault).toBe(true);

    // grants backfilled for all 4 roles
    expect(db.cnRolePermissionV2.createMany).toHaveBeenCalledTimes(4);
  });

  it("does NOT re-create grants that already exist (idempotent backfill)", async () => {
    const orgId = freshOrg();
    db.cnAppRole.upsert.mockImplementation(async (args: any) =>
      ({ id: `role-${args.where.orgId_appId_name.name}` }),
    );
    // Pretend every role already has ALL its grants → nothing missing.
    db.cnRolePermissionV2.findMany.mockImplementation(async () => {
      // Return the full admin grant set so the admin "missing" diff is empty;
      // for the smaller roles a superset is also fine (filter keeps it empty).
      const { PERMISSIONS } = await import("@/lib/permissions");
      const { parsePermissionKey } = await import("@/lib/rbac/permissionsRegistry");
      return Object.values(PERMISSIONS)
        .map((k) => parsePermissionKey(k as string))
        .filter(Boolean) as Array<{ resource: string; action: string }>;
    });
    db.cnRolePermissionV2.createMany.mockResolvedValue({ count: 0 });

    await seedDefaultRoles(orgId);

    // Roles still upserted (upsert is itself idempotent), but no grant inserts.
    expect(db.cnAppRole.upsert).toHaveBeenCalledTimes(4);
    expect(db.cnRolePermissionV2.createMany).not.toHaveBeenCalled();
  });

  // NOTE: the missing-app (returns null) branch can't be isolated here —
  // getQuikInfraAppId() memoizes the resolved app id in a module-level
  // variable that survives resetMockDb(), so once any earlier test resolved
  // "app-1" the null mock is never consulted. The branch is exercised
  // implicitly by the userCan suite's app lookup; left uncovered here on
  // purpose rather than adding a brittle module-reset hack.
});

describe("seedDefaultRoles — warm cache no-op", () => {
  it("on the second call it returns the existing ids via loadSeededIds without upserting again", async () => {
    const orgId = freshOrg();
    db.cnAppRole.upsert.mockImplementation(async (args: any) =>
      ({ id: `role-${args.where.orgId_appId_name.name}` }),
    );
    db.cnRolePermissionV2.findMany.mockResolvedValue([]);
    db.cnRolePermissionV2.createMany.mockResolvedValue({ count: 1 });

    // First call seeds (populates the cache).
    await seedDefaultRoles(orgId);
    db.cnAppRole.upsert.mockClear();

    // loadSeededIds path: findMany on cnAppRole returns the 4 roles by name.
    db.cnAppRole.findMany.mockResolvedValue([
      { id: "role-admin", name: "admin" },
      { id: "role-ho_user", name: "ho_user" },
      { id: "role-site_admin", name: "site_admin" },
      { id: "role-user", name: "user" },
    ]);

    const result = await seedDefaultRoles(orgId);
    expect(result).toEqual({
      adminRoleId: "role-admin",
      hoUserRoleId: "role-ho_user",
      siteAdminRoleId: "role-site_admin",
      userRoleId: "role-user",
    });
    // Cache hit → no re-upsert.
    expect(db.cnAppRole.upsert).not.toHaveBeenCalled();
  });
});

describe("ensureUserOnRole", () => {
  it("is a no-op when the assignment already exists", async () => {
    db.cnUserAppRole.findFirst.mockResolvedValue({ id: "uar-1" });
    await ensureUserOnRole("u1", "org-1", "role-1");
    expect(db.cnUserAppRole.create).not.toHaveBeenCalled();
  });

  it("creates the assignment when none exists", async () => {
    db.cnUserAppRole.findFirst.mockResolvedValue(null);
    db.cnUserAppRole.create.mockResolvedValue({ id: "uar-new" });
    await ensureUserOnRole("u1", "org-1", "role-1", "admin-9");
    expect(db.cnUserAppRole.create).toHaveBeenCalledWith({
      data: { userId: "u1", orgId: "org-1", roleId: "role-1", assignedBy: "admin-9" },
    });
  });

  it("swallows a P2002 race on create (concurrent insert)", async () => {
    db.cnUserAppRole.findFirst.mockResolvedValue(null);
    db.cnUserAppRole.create.mockRejectedValue({ code: "P2002" });
    await expect(ensureUserOnRole("u1", "org-1", "role-1")).resolves.toBeUndefined();
  });

  it("rethrows non-P2002 errors", async () => {
    db.cnUserAppRole.findFirst.mockResolvedValue(null);
    db.cnUserAppRole.create.mockRejectedValue({ code: "P9999" });
    await expect(ensureUserOnRole("u1", "org-1", "role-1")).rejects.toMatchObject({ code: "P9999" });
  });
});

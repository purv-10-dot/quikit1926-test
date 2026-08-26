import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { userCan, isOrgAdmin, isAdminRole, loadMyPermissions } from "@/lib/api/permissions";
import { isValidPermissionPair, isResource, isAction } from "@/lib/api/permissionsRegistry";

beforeEach(() => resetMockDb());

describe("permissionsRegistry", () => {
  it("accepts a valid (resource, action) pair from the tree", () => {
    expect(isValidPermissionPair("Workflows", "create")).toBe(true);
  });

  it("rejects an action the leaf doesn't declare", () => {
    // Approvals only declares view/update, never create/delete.
    expect(isValidPermissionPair("Approvals", "delete")).toBe(false);
  });

  it("rejects an unknown resource", () => {
    expect(isResource("NotARealResource")).toBe(false);
  });

  it("rejects an unknown action", () => {
    expect(isAction("archive")).toBe(false);
  });
});

describe("isAdminRole", () => {
  it("true only for isSystem + name === admin", () => {
    expect(isAdminRole({ isSystem: true, name: "admin" })).toBe(true);
    expect(isAdminRole({ isSystem: false, name: "admin" })).toBe(false);
    expect(isAdminRole({ isSystem: true, name: "Member" })).toBe(false);
    expect(isAdminRole(null)).toBe(false);
  });
});

describe("userCan", () => {
  it("returns false for an unknown resource without touching the DB", async () => {
    const allowed = await userCan("u1", "org_A", "NotAResource", "view");
    expect(allowed).toBe(false);
    expect(mockDb.app.findUnique).not.toHaveBeenCalled();
  });

  it("returns false when the QuikFlow App row isn't registered", async () => {
    mockDb.app.findUnique.mockResolvedValue(null);
    const allowed = await userCan("u1", "org_A", "Workflows", "view");
    expect(allowed).toBe(false);
  });

  it("returns true when a RolePermission grant exists via the user's role", async () => {
    mockDb.app.findUnique.mockResolvedValue({ id: "app_flow" } as never);
    mockDb.wfRolePermission.findFirst.mockResolvedValue({ id: "rp1" } as never);

    const allowed = await userCan("u1", "org_A", "Workflows", "create");

    expect(allowed).toBe(true);
    const where = mockDb.wfRolePermission.findFirst.mock.calls[0][0]?.where;
    expect(where?.resource).toBe("Workflows");
    expect(where?.action).toBe("create");
  });

  it("returns false when no role grants the permission (no UserPermissionExtra fallback)", async () => {
    mockDb.app.findUnique.mockResolvedValue({ id: "app_flow" } as never);
    mockDb.wfRolePermission.findFirst.mockResolvedValue(null);

    const allowed = await userCan("u1", "org_A", "Workflows", "delete");
    expect(allowed).toBe(false);
  });
});

describe("isOrgAdmin", () => {
  it("true when the user holds the system admin role", async () => {
    mockDb.app.findUnique.mockResolvedValue({ id: "app_flow" } as never);
    mockDb.wfUserAppRole.findFirst.mockResolvedValue({ id: "ur1" } as never);

    expect(await isOrgAdmin("u1", "org_A")).toBe(true);
  });

  it("false when the app isn't registered", async () => {
    mockDb.app.findUnique.mockResolvedValue(null);
    expect(await isOrgAdmin("u1", "org_A")).toBe(false);
  });
});

describe("loadMyPermissions", () => {
  it("returns the empty set when the user holds no role", async () => {
    mockDb.app.findUnique.mockResolvedValue({ id: "app_flow" } as never);
    mockDb.wfUserAppRole.findMany.mockResolvedValue([]);

    const perms = await loadMyPermissions("u1", "org_A");
    expect(perms).toEqual({ isAdmin: false, roleId: null, roleName: null, permissions: [] });
  });

  it("unions permissions across the user's role grants and flags admin", async () => {
    mockDb.app.findUnique.mockResolvedValue({ id: "app_flow" } as never);
    mockDb.wfUserAppRole.findMany.mockResolvedValue([
      {
        role: {
          id: "role_admin",
          name: "admin",
          isSystem: true,
          permissions: [
            { resource: "Workflows", action: "view" },
            { resource: "Workflows", action: "create" },
          ],
        },
      },
    ] as never);

    const perms = await loadMyPermissions("u1", "org_A");
    expect(perms.isAdmin).toBe(true);
    expect(perms.roleId).toBe("role_admin");
    expect(perms.permissions.sort()).toEqual(["Workflows:create", "Workflows:view"]);
  });
});

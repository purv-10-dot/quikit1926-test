import { describe, it, expect, beforeEach } from "vitest";
// Registers vi.mock for "@/lib/db" + "@quikit/database" (hoisted).
import { mockDb, resetMockDb } from "../../__tests__/helpers/mockDb";
import { userCan, isOrgAdmin, loadMyPermissions } from "./permissions";

const ORG = "org-1";
const USER = "user-1";

beforeEach(() => {
  resetMockDb();
  // getQuikChatAppId caches after the first hit; keep the App resolvable.
  mockDb.app.findUnique.mockResolvedValue({ id: "app-qc" } as never);
});

describe("userCan", () => {
  it("fails closed for an unknown resource/action (no DB touched)", async () => {
    expect(await userCan(USER, ORG, "Nope", "view")).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await userCan(USER, ORG, "Channel", "frobnicate" as any)).toBe(false);
  });

  it("grants when a role permission row matches", async () => {
    mockDb.qcRolePermission.findFirst.mockResolvedValue({ id: "rp-1" } as never);
    expect(await userCan(USER, ORG, "Channel", "create")).toBe(true);
  });

  it("grants via a per-user extra when the role has no grant", async () => {
    mockDb.qcRolePermission.findFirst.mockResolvedValue(null as never);
    mockDb.qcUserPermissionExtra.findFirst.mockResolvedValue({ id: "ex-1" } as never);
    expect(await userCan(USER, ORG, "Channel.Public", "create")).toBe(true);
  });

  it("denies when neither a role grant nor an extra exists", async () => {
    mockDb.qcRolePermission.findFirst.mockResolvedValue(null as never);
    mockDb.qcUserPermissionExtra.findFirst.mockResolvedValue(null as never);
    expect(await userCan(USER, ORG, "Assistant.IngestOrg", "create")).toBe(false);
  });
});

describe("isOrgAdmin", () => {
  it("is true when the user holds the system admin role", async () => {
    mockDb.qcUserAppRole.findFirst.mockResolvedValue({ id: "uar-1" } as never);
    expect(await isOrgAdmin(USER, ORG)).toBe(true);
  });

  it("is false when the user holds no admin role (extras are ignored)", async () => {
    mockDb.qcUserAppRole.findFirst.mockResolvedValue(null as never);
    expect(await isOrgAdmin(USER, ORG)).toBe(false);
  });
});

describe("loadMyPermissions", () => {
  it("unions role grants with per-user extras and reports the primary role", async () => {
    mockDb.qcUserAppRole.findMany.mockResolvedValue([
      {
        role: {
          id: "r-member",
          name: "Member",
          isSystem: false,
          permissions: [
            { resource: "Channel", action: "view" },
            { resource: "Channel", action: "create" },
          ],
        },
      },
    ] as never);
    mockDb.qcUserPermissionExtra.findMany.mockResolvedValue([
      { resource: "Assistant", action: "view" },
    ] as never);

    const me = await loadMyPermissions(USER, ORG);
    expect(me.isAdmin).toBe(false);
    expect(me.roleId).toBe("r-member");
    expect(me.roleName).toBe("Member");
    expect(new Set(me.permissions)).toEqual(
      new Set(["Channel:view", "Channel:create", "Assistant:view"]),
    );
    expect(me.extras).toEqual(["Assistant:view"]);
  });

  it("flags isAdmin when a system admin role is present", async () => {
    mockDb.qcUserAppRole.findMany.mockResolvedValue([
      { role: { id: "r-admin", name: "admin", isSystem: true, permissions: [] } },
    ] as never);
    mockDb.qcUserPermissionExtra.findMany.mockResolvedValue([] as never);

    const me = await loadMyPermissions(USER, ORG);
    expect(me.isAdmin).toBe(true);
    expect(me.roleName).toBe("admin");
  });

  it("returns the empty set when the user has no roles or extras", async () => {
    mockDb.qcUserAppRole.findMany.mockResolvedValue([] as never);
    mockDb.qcUserPermissionExtra.findMany.mockResolvedValue([] as never);
    const me = await loadMyPermissions(USER, ORG);
    expect(me).toEqual({
      isAdmin: false,
      roleId: null,
      roleName: null,
      permissions: [],
      extras: [],
    });
  });
});

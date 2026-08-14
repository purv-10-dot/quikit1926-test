import { describe, it, expect, beforeEach } from "vitest";
// Registers vi.mock for "@/lib/db" + "@quikit/database" (hoisted).
import { mockDb, resetMockDb } from "../../__tests__/helpers/mockDb";
import { userCan, loadMyPermissions, __resetAppIdCacheForTest } from "./permissions";

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

/**
 * Negative caching on `getQuikChatAppId`.
 *
 * The miss was the expensive case: `cachedAppId` was only assigned on success,
 * so an environment with no `App` row re-queried on every userCan, every
 * loadMyPermissions, every extraAdminCheck, and once per request via
 * ensureUserRole — the broken deployment was also the slowest one.
 */
describe("getQuikChatAppId caching (via userCan)", () => {
  beforeEach(() => {
    resetMockDb();
    __resetAppIdCacheForTest();
  });

  it("queries once for a miss, not once per permission check", async () => {
    mockDb.app.findUnique.mockResolvedValue(null as never);

    expect(await userCan(USER, ORG, "Channel", "create")).toBe(false);
    expect(await userCan(USER, ORG, "Channel", "view")).toBe(false);
    expect(await userCan(USER, ORG, "Call", "create")).toBe(false);

    expect(mockDb.app.findUnique).toHaveBeenCalledTimes(1);
  });

  it("queries once for a hit and reuses it", async () => {
    mockDb.app.findUnique.mockResolvedValue({ id: "app-qc" } as never);
    mockDb.qcRolePermission.findFirst.mockResolvedValue(null as never);
    mockDb.qcUserPermissionExtra.findFirst.mockResolvedValue(null as never);

    await userCan(USER, ORG, "Channel", "create");
    await userCan(USER, ORG, "Channel", "view");

    expect(mockDb.app.findUnique).toHaveBeenCalledTimes(1);
  });

  // Without the reset hook this would be impossible to test in-file at all —
  // which is the coupling the hook exists to break.
  it("re-queries after the cache is reset", async () => {
    mockDb.app.findUnique.mockResolvedValue(null as never);
    await userCan(USER, ORG, "Channel", "create");
    expect(mockDb.app.findUnique).toHaveBeenCalledTimes(1);

    __resetAppIdCacheForTest();
    await userCan(USER, ORG, "Channel", "create");
    expect(mockDb.app.findUnique).toHaveBeenCalledTimes(2);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
// Registers vi.mock for "@/lib/db" + "@quikit/database" (hoisted).
import { mockDb, resetMockDb } from "../../__tests__/helpers/mockDb";
import { allPermissionPairs } from "./permissionsRegistry";
import { seedAllDefaultRoles, ensureSeeded, collapseToLatestRole } from "./seed";

const ORG = "org-1";

/** Configure the deep mock for a "fresh org, no existing members" seed run. */
function freshOrgMocks() {
  mockDb.app.findUnique.mockResolvedValue({ id: "app-qc" } as never);
  mockDb.qcAppRole.findFirst.mockResolvedValue(null as never);
  mockDb.qcAppRole.updateMany.mockResolvedValue({ count: 0 } as never);
  mockDb.qcAppRole.create.mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (args: any) => Promise.resolve({ id: `role-${args.data.name}` }) as never,
  );
  mockDb.qcRolePermission.count.mockResolvedValue(0 as never);
  mockDb.qcRolePermission.createMany.mockResolvedValue({ count: 0 } as never);
  // Backfill sees every pair already present → never re-grants (keeps createMany
  // to exactly one call per role in the seed path).
  mockDb.qcRolePermission.findMany.mockResolvedValue(allPermissionPairs() as never);
  mockDb.userAppAccess.findMany.mockResolvedValue([] as never);
  mockDb.qcUserAppRole.createMany.mockResolvedValue({ count: 0 } as never);
}

beforeEach(() => {
  resetMockDb();
});

// MUST run first: getQuikChatAppId caches on a hit, so once any later test
// resolves the App, this null path can no longer be exercised in-file.
describe("seedAllDefaultRoles — unregistered app", () => {
  it("returns null (no-op) when the QuikChat App is not registered", async () => {
    mockDb.app.findUnique.mockResolvedValue(null as never);
    const result = await seedAllDefaultRoles("org-unregistered");
    expect(result).toBeNull();
    expect(mockDb.qcAppRole.create).not.toHaveBeenCalled();
  });
});

describe("seedAllDefaultRoles", () => {
  it("creates the four canonical roles with the correct grant counts", async () => {
    freshOrgMocks();
    await seedAllDefaultRoles(ORG);

    const created = mockDb.qcAppRole.create.mock.calls.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c: any) => c[0].data,
    );
    const byName = new Map(created.map((d) => [d.name, d]));
    expect([...byName.keys()].sort()).toEqual(["Guest", "Member", "Moderator", "admin"]);

    // admin is the only isSystem role; Member is the only isDefault.
    expect(byName.get("admin")?.isSystem).toBe(true);
    expect(byName.get("admin")?.isDefault).toBe(false);
    expect(byName.get("Member")?.isDefault).toBe(true);
    expect(byName.get("Member")?.isSystem).toBe(false);

    // Grant-set sizes: admin=17 (all pairs), Moderator=10, Member=8, Guest=1.
    const grantSizes = mockDb.qcRolePermission.createMany.mock.calls
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((c: any) => c[0].data.length)
      .sort((a: number, b: number) => a - b);
    expect(grantSizes).toEqual([1, 8, 10, 17]);
  });

  it("Member (isDefault) grants exclude Channel.Public / Moderate / IngestOrg / config", async () => {
    freshOrgMocks();
    await seedAllDefaultRoles(ORG);

    // The 8-row createMany is the Member seed.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calls = mockDb.qcRolePermission.createMany.mock.calls as any[];
    const memberCall = calls.find((c) => c[0].data.length === 8);
    expect(memberCall).toBeTruthy();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resources = new Set((memberCall[0].data as any[]).map((g: any) => g.resource));
    expect(resources.has("Channel.Public")).toBe(false);
    expect(resources.has("Channel.Moderate")).toBe(false);
    expect(resources.has("Assistant.IngestOrg")).toBe(false);
    expect(resources.has("Assistant.Configure")).toBe(false);
    expect(resources.has("App.Modules")).toBe(false);
    // …but includes the day-to-day surfaces.
    expect(resources.has("Channel.DM")).toBe(true);
    expect(resources.has("Assistant.IngestPrivate")).toBe(true);
  });

  it("is idempotent — existing roles with grants are not re-created or re-granted", async () => {
    mockDb.app.findUnique.mockResolvedValue({ id: "app-qc" } as never);
    mockDb.qcAppRole.findFirst.mockResolvedValue({ id: "role-existing" } as never);
    mockDb.qcRolePermission.count.mockResolvedValue(5 as never); // already has grants
    mockDb.qcRolePermission.findMany.mockResolvedValue(allPermissionPairs() as never);
    mockDb.userAppAccess.findMany.mockResolvedValue([] as never);

    await seedAllDefaultRoles(ORG);

    expect(mockDb.qcAppRole.create).not.toHaveBeenCalled();
    expect(mockDb.qcRolePermission.createMany).not.toHaveBeenCalled();
  });
});

describe("backfillExistingMembers (DECISION 1)", () => {
  it("assigns Member to plain members and admin to org_admins / super_admins", async () => {
    freshOrgMocks();
    mockDb.userAppAccess.findMany.mockResolvedValue([
      { userId: "u1" },
      { userId: "u2" },
      { userId: "u1" }, // duplicate — must dedupe
    ] as never);
    mockDb.qcUserAppRole.findMany.mockResolvedValue([] as never); // none assigned yet
    mockDb.orgMember.findMany.mockResolvedValue([
      { userId: "u1", role: "org_admin" },
      { userId: "u2", role: "member" },
    ] as never);
    mockDb.user.findMany.mockResolvedValue([
      { id: "u1", isSuperAdmin: false },
      { id: "u2", isSuperAdmin: false },
    ] as never);

    await seedAllDefaultRoles(ORG);

    expect(mockDb.qcUserAppRole.createMany).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (mockDb.qcUserAppRole.createMany.mock.calls[0][0] as any).data;
    expect(rows).toHaveLength(2);
    const roleByUser = new Map(rows.map((r: { userId: string; roleId: string }) => [r.userId, r.roleId]));
    expect(roleByUser.get("u1")).toBe("role-admin");
    expect(roleByUser.get("u2")).toBe("role-Member");
  });

  it("promotes a platform super-admin (isSuperAdmin) to admin", async () => {
    freshOrgMocks();
    mockDb.userAppAccess.findMany.mockResolvedValue([{ userId: "u3" }] as never);
    mockDb.qcUserAppRole.findMany.mockResolvedValue([] as never);
    mockDb.orgMember.findMany.mockResolvedValue([{ userId: "u3", role: "member" }] as never);
    mockDb.user.findMany.mockResolvedValue([{ id: "u3", isSuperAdmin: true }] as never);

    await seedAllDefaultRoles(ORG);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (mockDb.qcUserAppRole.createMany.mock.calls[0][0] as any).data;
    expect(rows[0].roleId).toBe("role-admin");
  });

  it("skips users who already hold a role", async () => {
    freshOrgMocks();
    mockDb.userAppAccess.findMany.mockResolvedValue([{ userId: "u1" }] as never);
    mockDb.qcUserAppRole.findMany.mockResolvedValue([{ userId: "u1" }] as never); // already assigned
    mockDb.orgMember.findMany.mockResolvedValue([] as never);
    mockDb.user.findMany.mockResolvedValue([] as never);

    await seedAllDefaultRoles(ORG);
    expect(mockDb.qcUserAppRole.createMany).not.toHaveBeenCalled();
  });
});

describe("collapseToLatestRole", () => {
  beforeEach(() => {
    mockDb.app.findUnique.mockResolvedValue({ id: "app-qc" } as never);
  });

  it("keeps the newest role and deletes the rest", async () => {
    mockDb.qcUserAppRole.findMany.mockResolvedValue([
      { id: "newest" },
      { id: "stale-1" },
      { id: "stale-2" },
    ] as never);
    mockDb.qcUserAppRole.deleteMany.mockResolvedValue({ count: 2 } as never);

    const removed = await collapseToLatestRole("u1", ORG);
    expect(removed).toBe(2);
    expect(mockDb.qcUserAppRole.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["stale-1", "stale-2"] } },
    });
  });

  it("is a no-op when the user holds a single role", async () => {
    mockDb.qcUserAppRole.findMany.mockResolvedValue([{ id: "only" }] as never);
    const removed = await collapseToLatestRole("u1", ORG);
    expect(removed).toBe(0);
    expect(mockDb.qcUserAppRole.deleteMany).not.toHaveBeenCalled();
  });
});

describe("ensureSeeded", () => {
  it("seeds once then short-circuits within the TTL", async () => {
    freshOrgMocks();
    const org = "org-ensure-unique";

    await ensureSeeded(org);
    const afterFirst = mockDb.qcAppRole.findFirst.mock.calls.length;
    expect(afterFirst).toBeGreaterThan(0);

    await ensureSeeded(org); // cache hit — no further DB work
    expect(mockDb.qcAppRole.findFirst.mock.calls.length).toBe(afterFirst);
  });
});

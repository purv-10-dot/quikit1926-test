import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Continuous central → HRMS membership sync (lib/rbac/central-sync.ts):
 * suspension on central removal, reactivation on restore, admin/employee
 * re-mapping on central role transitions, baseline backfill, and fail-open
 * behaviour when central is unreachable.
 */

// Must be set BEFORE the module under test is (dynamically) imported — it
// reads these at module load to decide whether sync is configured.
process.env.QUIKIT_URL = "http://localhost:3000";
process.env.INTERNAL_SECRET = "test-secret";

// ── Mocks ────────────────────────────────────────────────────────────────
const invalidateKeys = vi.fn();
const employeeFindFirst = vi.fn();
const employeeUpdate = vi.fn();
const appRoleFindMany = vi.fn();
const userAppRoleUpsert = vi.fn();
const userAppRoleDeleteMany = vi.fn();
const userAppRoleCount = vi.fn();

vi.mock("@/lib/services/cache", () => ({
  invalidateKeys: (...a: unknown[]) => invalidateKeys(...a),
  cacheKeys: {
    permissions: (t: string, u: string) => `perms:${t}:${u}`,
    employeeMe: (t: string, u: string) => `employee-me:${t}:${u}`,
    notifUnread: (t: string, u: string) => `notif-unread:${t}:${u}`,
    permissionsTenantPattern: (t: string) => `perms:${t}:*`,
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    employee: {
      findFirst: (...a: unknown[]) => employeeFindFirst(...a),
      update: (...a: unknown[]) => employeeUpdate(...a),
    },
    appRole: { findMany: (...a: unknown[]) => appRoleFindMany(...a) },
    userAppRole: {
      upsert: (...a: unknown[]) => userAppRoleUpsert(...a),
      deleteMany: (...a: unknown[]) => userAppRoleDeleteMany(...a),
      count: (...a: unknown[]) => userAppRoleCount(...a),
    },
  },
}));

type SyncModule = typeof import("@/lib/rbac/central-sync");
async function loadModule(): Promise<SyncModule> {
  return import("@/lib/rbac/central-sync");
}

function member(overrides: Partial<{
  found: boolean; userId: string | null; memberStatus: string | null;
  memberRole: string | null; hasAppAccess: boolean; isSuperAdmin: boolean;
}> = {}) {
  return {
    requested: "auth-1",
    found: true,
    userId: "auth-1",
    email: "u@acme.com",
    isSuperAdmin: false,
    memberStatus: "active",
    memberRole: "member",
    hasAppAccess: true,
    ...overrides,
  };
}

const ROLES = [
  { id: "r-admin", name: "admin" },
  { id: "r-emp", name: "employee" },
];

describe("applyCentralState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    employeeUpdate.mockResolvedValue({});
    appRoleFindMany.mockResolvedValue(ROLES);
    userAppRoleUpsert.mockResolvedValue({});
    userAppRoleDeleteMany.mockResolvedValue({ count: 1 });
    userAppRoleCount.mockResolvedValue(1);
  });

  it("suspends the employee and denies when central access is revoked", async () => {
    employeeFindFirst.mockResolvedValue({ id: "e1", status: "Active", centralRole: "member", centralDeactivatedAt: null });
    const { applyCentralState } = await loadModule();

    const allowed = await applyCentralState("tenant-1", "e1", member({ memberStatus: "suspended" }));

    expect(allowed).toBe(false);
    expect(employeeUpdate).toHaveBeenCalledTimes(1);
    const update = employeeUpdate.mock.calls[0][0];
    expect(update.data.status).toBe("Suspended");
    expect(update.data.centralDeactivatedAt).toBeInstanceOf(Date);
    expect(invalidateKeys).toHaveBeenCalled();
  });

  it("denies when the central user no longer exists, without re-suspending a Suspended employee", async () => {
    employeeFindFirst.mockResolvedValue({ id: "e1", status: "Suspended", centralRole: "member", centralDeactivatedAt: new Date() });
    const { applyCentralState } = await loadModule();

    const allowed = await applyCentralState("tenant-1", "e1", member({ found: false, userId: null, memberStatus: null, memberRole: null, hasAppAccess: false }));

    expect(allowed).toBe(false);
    expect(employeeUpdate).not.toHaveBeenCalled();
  });

  it("denies when HRMS app access was revoked even though the membership is active", async () => {
    employeeFindFirst.mockResolvedValue({ id: "e1", status: "Active", centralRole: "member", centralDeactivatedAt: null });
    const { applyCentralState } = await loadModule();

    expect(await applyCentralState("tenant-1", "e1", member({ hasAppAccess: false }))).toBe(false);
  });

  it("reactivates a sync-suspended employee when central access is restored", async () => {
    employeeFindFirst.mockResolvedValue({ id: "e1", status: "Suspended", centralRole: "member", centralDeactivatedAt: new Date() });
    const { applyCentralState } = await loadModule();

    const allowed = await applyCentralState("tenant-1", "e1", member());

    expect(allowed).toBe(true);
    const update = employeeUpdate.mock.calls[0][0];
    expect(update.data).toMatchObject({ status: "Active", centralDeactivatedAt: null });
  });

  it("grants the HRMS admin role when central promotes member → org_admin", async () => {
    employeeFindFirst.mockResolvedValue({ id: "e1", status: "Active", centralRole: "member", centralDeactivatedAt: null });
    const { applyCentralState } = await loadModule();

    const allowed = await applyCentralState("tenant-1", "e1", member({ memberRole: "org_admin" }));

    expect(allowed).toBe(true);
    expect(userAppRoleUpsert).toHaveBeenCalledTimes(1);
    expect(userAppRoleUpsert.mock.calls[0][0].create).toMatchObject({ userId: "e1", roleId: "r-admin", assignedBy: "central-sync" });
    // New central baseline recorded for the next transition.
    expect(employeeUpdate.mock.calls.at(-1)?.[0].data).toMatchObject({ centralRole: "org_admin" });
  });

  it("removes the admin role (keeping baseline access) when central demotes org_admin → member", async () => {
    employeeFindFirst.mockResolvedValue({ id: "e1", status: "Active", centralRole: "org_admin", centralDeactivatedAt: null });
    userAppRoleCount.mockResolvedValue(0); // admin was their only role
    const { applyCentralState } = await loadModule();

    const allowed = await applyCentralState("tenant-1", "e1", member({ memberRole: "member" }));

    expect(allowed).toBe(true);
    expect(userAppRoleDeleteMany).toHaveBeenCalledWith({
      where: { userId: "e1", orgId: "tenant-1", roleId: "r-admin" },
    });
    expect(userAppRoleUpsert.mock.calls[0][0].create).toMatchObject({ roleId: "r-emp" });
  });

  it("backfills the baseline without touching roles for pre-column employees", async () => {
    employeeFindFirst.mockResolvedValue({ id: "e1", status: "Active", centralRole: null, centralDeactivatedAt: null });
    const { applyCentralState } = await loadModule();

    const allowed = await applyCentralState("tenant-1", "e1", member({ memberRole: "org_admin" }));

    expect(allowed).toBe(true);
    expect(userAppRoleUpsert).not.toHaveBeenCalled();
    expect(userAppRoleDeleteMany).not.toHaveBeenCalled();
    expect(employeeUpdate.mock.calls[0][0].data).toMatchObject({ centralRole: "org_admin" });
  });

  it("does not remap when the central role changes within the same mapped tier", async () => {
    employeeFindFirst.mockResolvedValue({ id: "e1", status: "Active", centralRole: "org_admin", centralDeactivatedAt: null });
    const { applyCentralState } = await loadModule();

    // org_admin → app_admin: both map to HRMS "admin" — record baseline only.
    const allowed = await applyCentralState("tenant-1", "e1", member({ memberRole: "app_admin" }));

    expect(allowed).toBe(true);
    expect(userAppRoleUpsert).not.toHaveBeenCalled();
    expect(userAppRoleDeleteMany).not.toHaveBeenCalled();
  });

  it("treats platform super-admins as live even without an org membership", async () => {
    employeeFindFirst.mockResolvedValue({ id: "e1", status: "Active", centralRole: "super_admin", centralDeactivatedAt: null });
    const { applyCentralState } = await loadModule();

    const allowed = await applyCentralState(
      "tenant-1", "e1",
      member({ isSuperAdmin: true, memberStatus: null, memberRole: null, hasAppAccess: false }),
    );

    expect(allowed).toBe(true);
    expect(employeeUpdate).not.toHaveBeenCalled();
  });
});

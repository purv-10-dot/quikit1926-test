import { describe, expect, it, beforeEach, vi } from "vitest";

const getQuikcrmexpressAppId = vi.hoisted(() => vi.fn().mockResolvedValue("app-crmx"));
const seedAllDefaultCrmRoles = vi.hoisted(() => vi.fn());
const mirrorAppRoleToCentral = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const isCrmRbacClientReady = vi.hoisted(() => vi.fn().mockReturnValue(true));

const client = vi.hoisted(() => ({
  qceAppRole: { findFirst: vi.fn() },
  qceUserAppRole: {
    findFirst: vi.fn(),
    create: vi.fn().mockResolvedValue({ id: "uar-1" }),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  },
}));

vi.mock("@/lib/api/quikcrmexpress-app", () => ({ getQuikcrmexpressAppId }));
vi.mock("@/lib/api/seed-crm-app-roles", () => ({ seedAllDefaultCrmRoles }));
vi.mock("@quikit/auth/assign-app-roles", () => ({ mirrorAppRoleToCentral }));
vi.mock("@/lib/api/crm-rbac-client", () => ({
  isCrmRbacClientReady,
  rbacDb: () => (isCrmRbacClientReady() ? client : null),
}));
vi.mock("@/lib/db", () => ({ db: {} }));

import {
  ensureCrmRolesForOrg,
  hasAnyCrmAppRole,
  syncUserCrmAppRole,
} from "@/lib/api/crm-rbac";

beforeEach(() => {
  vi.clearAllMocks();
  isCrmRbacClientReady.mockReturnValue(true);
  getQuikcrmexpressAppId.mockResolvedValue("app-crmx");
  seedAllDefaultCrmRoles.mockResolvedValue({
    adminRoleId: "role-admin",
    defaultRoleId: "role-sales-user",
  });
  client.qceUserAppRole.findFirst.mockResolvedValue(null);
});

describe("hasAnyCrmAppRole", () => {
  it("is false when the user holds no role in this app", async () => {
    await expect(hasAnyCrmAppRole("u1", "org-1")).resolves.toBe(false);
  });

  it("is true when a role row exists", async () => {
    client.qceUserAppRole.findFirst.mockResolvedValue({ id: "uar-1" });
    await expect(hasAnyCrmAppRole("u1", "org-1")).resolves.toBe(true);
  });

  it("scopes the lookup to this app and org", async () => {
    await hasAnyCrmAppRole("u1", "org-1");
    expect(client.qceUserAppRole.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1", orgId: "org-1", role: { appId: "app-crmx" } },
      }),
    );
  });
});

describe("ensureCrmRolesForOrg — the app-startup bootstrap", () => {
  it("seeds the org's roles and binds an admin-tier caller to the admin role", async () => {
    await ensureCrmRolesForOrg("u1", "org-1", true);
    expect(seedAllDefaultCrmRoles).toHaveBeenCalledWith("org-1");
    expect(client.qceUserAppRole.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "u1", orgId: "org-1", roleId: "role-admin" }),
      }),
    );
  });

  it("seeds for a non-admin caller but does not auto-bind them", async () => {
    // Binding a non-admin to the default role would ADD grants their legacy
    // role baseline never gave them (e.g. a FinanceUser gaining sales grants).
    await ensureCrmRolesForOrg("u1", "org-1", false);
    expect(seedAllDefaultCrmRoles).toHaveBeenCalledWith("org-1");
    expect(client.qceUserAppRole.create).not.toHaveBeenCalled();
  });

  it("still seeds the org's roles when the user already holds one, but does not rebind", async () => {
    // The dropdown-population case: roles must exist for every org member,
    // while a deliberately demoted user keeps the role they were given.
    client.qceUserAppRole.findFirst.mockResolvedValue({ id: "uar-1" });
    await ensureCrmRolesForOrg("u1", "org-1", true);
    expect(seedAllDefaultCrmRoles).toHaveBeenCalledWith("org-1");
    expect(client.qceUserAppRole.create).not.toHaveBeenCalled();
  });

  it("no-ops when the RBAC delegates are not generated", async () => {
    isCrmRbacClientReady.mockReturnValue(false);
    await ensureCrmRolesForOrg("u1", "org-1", true);
    expect(seedAllDefaultCrmRoles).not.toHaveBeenCalled();
  });
});

describe("syncUserCrmAppRole", () => {
  beforeEach(() => {
    client.qceAppRole.findFirst.mockResolvedValue({ id: "role-admin" });
  });

  it("mirrors the assigned role name onto the central UserAppAccess row", async () => {
    // Regression: without this the Admin Portal kept showing the previous role
    // after a change made inside CrmExpress Settings → Users.
    await syncUserCrmAppRole("u1", "org-1", "Administrator", "actor-1");
    expect(mirrorAppRoleToCentral).toHaveBeenCalledWith(
      {},
      { orgId: "org-1", userId: "u1", appId: "app-crmx", roleName: "admin" },
    );
  });

  it("maps a non-admin membership role to its app role before mirroring", async () => {
    client.qceAppRole.findFirst.mockResolvedValue({ id: "role-sales-manager" });
    await syncUserCrmAppRole("u1", "org-1", "SalesManager");
    expect(mirrorAppRoleToCentral).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ roleName: "sales-manager" }),
    );
  });

  it("replaces any prior role rather than stacking a second one", async () => {
    await syncUserCrmAppRole("u1", "org-1", "Administrator");
    expect(client.qceUserAppRole.deleteMany).toHaveBeenCalledWith({
      where: { userId: "u1", orgId: "org-1", role: { appId: "app-crmx" } },
    });
  });

  it("does not mirror when the named role does not exist in this org", async () => {
    client.qceAppRole.findFirst.mockResolvedValue(null);
    await syncUserCrmAppRole("u1", "org-1", "Administrator");
    expect(mirrorAppRoleToCentral).not.toHaveBeenCalled();
  });
});

/**
 * Regression: non-admin CRM roles could not open Inbox/Sent/Drafts/All.
 *
 * `mailbox` is a registered CRM module, but none of the four non-admin role
 * specs granted it. Any SalesUser / SalesManager / MarketingUser / FinanceUser
 * who had already connected and synced their own mailbox hit
 * `assertModule(user, "mailbox", "view")` → 403, which inside the mailbox
 * server-component pages surfaced as "An error occurred in the Server
 * Components render". Only Administrator worked (ADMIN_ROLE bypass).
 *
 * A mailbox is PERSONAL data — every read is scoped to the caller's own
 * `mailboxConnectionId` — so every seeded role gets mailbox access, and orgs
 * seeded before mailbox existed are backfilled.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock, resetPrismaUnitMocks } from "../../helpers/prisma-unit-mock";

const APP_ID = "app-quikcrm";

/** Every non-admin role seeded for a CRM org. */
const NON_ADMIN_ROLES = ["sales-user", "sales-manager", "marketing-user", "finance-user"];

beforeEach(() => {
  resetPrismaUnitMocks();
  prismaMock.app.findUnique.mockResolvedValue({ id: APP_ID } as never);
});

describe("seedAllDefaultCrmRoles — mailbox grants for non-admin roles", () => {
  it("grants mailbox view to every non-admin role on a fresh org", async () => {
    vi.resetModules();
    const { seedAllDefaultCrmRoles } = await import("@/lib/api/seed-crm-app-roles");

    // Fresh org: no roles exist yet, so every spec takes the create path and
    // writes its full grant set.
    const createdRoleNames = new Map<string, string>();
    let n = 0;
    prismaMock.crmAppRole.findFirst.mockImplementation((async (args: {
      select?: { permissions?: unknown };
    }) => {
      if (args?.select?.permissions) return { id: "role-admin", permissions: [] };
      return null;
    }) as never);
    prismaMock.crmAppRole.findMany.mockResolvedValue([] as never);
    prismaMock.crmAppRole.updateMany.mockResolvedValue({ count: 0 } as never);
    prismaMock.crmAppRole.create.mockImplementation((async (args: {
      data: { name: string };
    }) => {
      const id = `role-${++n}`;
      createdRoleNames.set(id, args.data.name);
      return { id };
    }) as never);
    prismaMock.crmRolePermission.count.mockResolvedValue(0 as never);

    const written: Array<{ roleId: string; resource: string; action: string }> = [];
    prismaMock.crmRolePermission.createMany.mockImplementation((async (args: {
      data: Array<{ roleId: string; resource: string; action: string }>;
    }) => {
      written.push(...args.data);
      return { count: args.data.length };
    }) as never);

    await seedAllDefaultCrmRoles("org-1");

    for (const roleName of NON_ADMIN_ROLES) {
      const roleId = [...createdRoleNames.entries()].find(([, n2]) => n2 === roleName)?.[0];
      expect(roleId, `role ${roleName} was seeded`).toBeTruthy();

      const grantsForRole = written.filter((w) => w.roleId === roleId);
      expect(
        grantsForRole.some((g) => g.resource === "mailbox" && g.action === "view"),
        `${roleName} can view its own mailbox`,
      ).toBe(true);
      expect(
        grantsForRole.some((g) => g.resource === "mailbox" && g.action === "create"),
        `${roleName} can compose from its own mailbox`,
      ).toBe(true);
    }
  });

  it("backfills mailbox grants onto roles seeded before mailbox existed", async () => {
    vi.resetModules();
    const { seedAllDefaultCrmRoles } = await import("@/lib/api/seed-crm-app-roles");

    // Existing org: roles are already seeded WITH grants, so seedRole's
    // `grantCount > 0` early-return skips them entirely. Without the dedicated
    // backfill these orgs would keep 403-ing forever.
    prismaMock.crmAppRole.findFirst.mockImplementation((async (args: {
      where?: { isDefault?: boolean };
      select?: { permissions?: unknown };
    }) => {
      if (args?.select?.permissions) {
        return { id: "role-admin", permissions: [] };
      }
      if (args?.where?.isDefault) return { id: "role-default" };
      return { id: "role-existing" };
    }) as never);
    prismaMock.crmRolePermission.count.mockResolvedValue(12 as never);

    // The four non-admin roles exist and hold NO mailbox grants.
    prismaMock.crmAppRole.findMany.mockResolvedValue(
      NON_ADMIN_ROLES.map((name) => ({ id: `role-${name}`, permissions: [] })) as never,
    );

    const written: Array<{ roleId: string; resource: string; action: string }> = [];
    prismaMock.crmRolePermission.createMany.mockImplementation((async (args: {
      data: Array<{ roleId: string; resource: string; action: string }>;
    }) => {
      written.push(...args.data);
      return { count: args.data.length };
    }) as never);

    await seedAllDefaultCrmRoles("org-existing");

    for (const roleName of NON_ADMIN_ROLES) {
      expect(
        written.some(
          (w) =>
            w.roleId === `role-${roleName}` &&
            w.resource === "mailbox" &&
            w.action === "view",
        ),
        `${roleName} was backfilled with mailbox view`,
      ).toBe(true);
    }

    // The backfill is mailbox-only — it must never rewrite other resources,
    // which would clobber an admin's hand-edited permission set.
    const backfilled = written.filter((w) => w.roleId.startsWith("role-sales-"));
    expect(backfilled.every((w) => w.resource === "mailbox")).toBe(true);
  });

  it("does not re-write mailbox grants a role already has", async () => {
    vi.resetModules();
    const { seedAllDefaultCrmRoles } = await import("@/lib/api/seed-crm-app-roles");

    prismaMock.crmAppRole.findFirst.mockImplementation((async (args: {
      where?: { isDefault?: boolean };
      select?: { permissions?: unknown };
    }) => {
      if (args?.select?.permissions) return { id: "role-admin", permissions: [] };
      if (args?.where?.isDefault) return { id: "role-default" };
      return { id: "role-existing" };
    }) as never);
    prismaMock.crmRolePermission.count.mockResolvedValue(12 as never);

    // Already fully granted for mailbox.
    prismaMock.crmAppRole.findMany.mockResolvedValue(
      NON_ADMIN_ROLES.map((name) => ({
        id: `role-${name}`,
        permissions: [
          { action: "view" },
          { action: "create" },
          { action: "edit" },
          { action: "delete" },
        ],
      })) as never,
    );

    const written: Array<{ roleId: string; resource: string }> = [];
    prismaMock.crmRolePermission.createMany.mockImplementation((async (args: {
      data: Array<{ roleId: string; resource: string }>;
    }) => {
      written.push(...args.data);
      return { count: args.data.length };
    }) as never);

    await seedAllDefaultCrmRoles("org-granted");

    // Nothing is written for the already-granted non-admin roles. (The admin
    // role is a separate backfill and is not asserted on here.)
    const nonAdminWrites = written.filter((w) =>
      NON_ADMIN_ROLES.some((name) => w.roleId === `role-${name}`),
    );
    expect(nonAdminWrites).toEqual([]);
  });
});

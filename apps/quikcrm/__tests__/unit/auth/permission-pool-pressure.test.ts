/**
 * Regression tests for the P2024 connection-pool-exhaustion fix.
 *
 * Two behaviours guard against the pool starvation that produced
 * "Timed out fetching a new connection from the connection pool":
 *
 *  1. seedAllDefaultCrmRoles() deduplicates concurrent calls for the same
 *     org — a fan-out of first-hit requests must trigger ONE seeding pass,
 *     not N. Previously each concurrent cold request ran the full ~15-query
 *     seed burst, multiplying pool pressure by the request fan-out.
 *
 *  2. assertModule()'s deny path must NOT seed roles. It already loaded the
 *     (empty) RBAC grants; the fallback now consults only the legacy template
 *     matrix instead of getEffectiveMatrix (which re-seeds + re-loads). This
 *     halves DB round-trips on every unauthorized request.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock, resetPrismaUnitMocks } from "../../helpers/prisma-unit-mock";
import type { SessionUser } from "@/types/permission";

const APP_ID = "app-quikcrm";

// getQuikCrmAppId caches module-level, so seed the App lookup once.
beforeEach(() => {
  resetPrismaUnitMocks();
  prismaMock.app.findUnique.mockResolvedValue({ id: APP_ID } as never);
});

describe("seedAllDefaultCrmRoles — concurrent dedup", () => {
  it("runs a single seeding pass for concurrent calls on the same org", async () => {
    // Re-import fresh so the module-level in-flight/seeded caches are clean.
    vi.resetModules();
    const { seedAllDefaultCrmRoles } = await import("@/lib/api/seed-crm-app-roles");

    // Roles do not exist yet → seedRole falls through to create() for each spec.
    // Track how many role-create bursts happen; with dedup it should be one pass.
    let createCalls = 0;
    prismaMock.crmAppRole.findFirst.mockImplementation((async (args: {
      where?: { name?: string; isDefault?: boolean; isSystem?: boolean };
      select?: { permissions?: unknown };
    }) => {
      // backfillAdminPermissions selects the admin role WITH its permissions;
      // return a fully-granted admin so nothing is backfilled.
      if (args?.select?.permissions) return { id: "role-admin", permissions: [] };
      // Pre-seed existence checks (per spec) return null → create path runs once.
      if (createCalls === 0) return null;
      if (args?.where?.isDefault) return { id: "role-default" };
      return { id: "role-admin" };
    }) as never);
    prismaMock.crmAppRole.updateMany.mockResolvedValue({ count: 0 } as never);
    prismaMock.crmAppRole.create.mockImplementation((async () => {
      createCalls++;
      return { id: `role-${createCalls}` };
    }) as never);
    prismaMock.crmRolePermission.count.mockResolvedValue(0 as never);
    prismaMock.crmRolePermission.createMany.mockResolvedValue({ count: 1 } as never);

    // Fire five concurrent cold requests for the same org.
    const results = await Promise.all(
      Array.from({ length: 5 }, () => seedAllDefaultCrmRoles("org-1")),
    );

    // All resolve to the same shape...
    for (const r of results) {
      expect(r).toHaveProperty("adminRoleId");
      expect(r).toHaveProperty("defaultRoleId");
    }

    // ...and only ONE pass created roles. Five specs → five creates, NOT 25
    // (which is what un-deduped concurrent seeding would produce).
    expect(createCalls).toBe(5);
  });
});

describe("assertModule — deny path does not seed", () => {
  it("does not create/seed any CRM AppRole when a non-admin is denied", async () => {
    vi.resetModules();
    const { assertModule } = await import("@/lib/auth/permissions");

    const user: SessionUser = {
      userId: "u-1",
      orgId: "org-1",
      role: "SalesUser",
      email: "s@example.com",
      name: "Sales",
    };

    // No RBAC grants (loadUserCrmGrants → empty) and no template links.
    prismaMock.crmUserAppRole.findMany.mockResolvedValue([] as never);
    prismaMock.crmUserPermissionExtra.findMany.mockResolvedValue([] as never);
    prismaMock.crmUserPermissionTemplate.findMany.mockResolvedValue([] as never);

    await expect(assertModule(user, "leads", "view")).rejects.toMatchObject({
      statusCode: 403,
    });

    // The deny path must never touch the role-seeding machinery.
    expect(prismaMock.crmAppRole.create).not.toHaveBeenCalled();
    expect(prismaMock.crmRolePermission.createMany).not.toHaveBeenCalled();
  });
});

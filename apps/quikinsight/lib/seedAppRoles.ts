/**
 * QuikInsight RBAC v2 seeding.
 *
 * The Admin Portal's role dropdown reads `app_quikinsight."AppRole"` directly
 * with raw SQL (apps/admin/app/api/roles/route.ts) and shows "No roles
 * available" whenever that table has no rows for the org. This module is what
 * puts rows there — called eagerly from /api/internal/provision-roles the
 * moment a super-admin grants an org access to QuikInsight, and idempotent so
 * repeat calls are free.
 *
 * Raw SQL rather than Prisma models: the AppRole family lives in the
 * app_quikinsight Postgres schema and is deliberately NOT modelled in the
 * shared Prisma schema — same arrangement as quikscale/quiktrack/quiklms.
 */

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { Role } from "@/lib/rbac";

/**
 * The two roles QuikInsight offers. Names MUST match the `Role` union in
 * lib/rbac.ts — that string is what lands in `session.user.role` and is looked
 * up in PERMISSIONS, so a name that drifts from the union grants nothing.
 *
 * LOWERCASE, matching every other app's AppRole table (quikcrm `admin`,
 * quikhrms `admin`/`employee`, quikinfra `admin`/`site_admin`) and
 * @quikit/shared's ROLES. The Admin Portal renders `AppRole.name` verbatim, so
 * the old SCREAMING_CASE showed up as "ADMIN"/"VIEWER" beside every other app's
 * lowercase names.
 *
 * `viewer` is the default: an assignment that arrives without an explicit role
 * should land on the least-privileged option, not on `admin`.
 */
export const APP_ROLES: ReadonlyArray<{
  name: SeededRole;
  description: string;
  isDefault: boolean;
  /**
   * Drives the Admin Portal's optgroup: `isSystem` rows land under "System
   * Roles", the rest under "Custom Roles". Only `admin` is a system role —
   * matching every other app, where System Roles holds `admin` alone and
   * app-specific roles (quikscale's "Member", ours "viewer") sit under Custom.
   * Seeding everything as isSystem put all three in the system group.
   */
  isSystem: boolean;
}> = [
  { name: "admin",  description: "Full access, including connecting accounts and managing roles", isDefault: false, isSystem: true },
  { name: "viewer", description: "Read-only access to analytics", isDefault: true, isSystem: false },
];

/** The subset of `Role` this app seeds and assigns. */
export type SeededRole = Extract<Role, "admin" | "viewer">;

/** Permission grants per role, mirroring PERMISSIONS in lib/rbac.ts. */
const ROLE_PERMISSIONS: Record<SeededRole, readonly string[]> = {
  admin:  ["analytics.view_own_team", "analytics.view_all_teams", "account.connect", "org.manage_roles"],
  viewer: ["analytics.view_own_team", "analytics.view_all_teams"],
};

/** Resolve the central quikit.App id for this app. Null if the row is absent. */
async function getQuikInsightAppId(): Promise<string | null> {
  const app = await db.app.findUnique({
    where: { slug: "quikinsight" },
    select: { id: true },
  });
  return app?.id ?? null;
}

/**
 * Seed the two system AppRole rows (and their permissions) for `orgId`.
 * Returns a map of role name → role id. Idempotent: existing rows are left
 * untouched and their ids are returned.
 */
export async function seedAppRoles(orgId: string): Promise<Map<SeededRole, string>> {
  const appId = await getQuikInsightAppId();
  if (!appId) {
    throw new Error("quikinsight App row not found in quikit.App — cannot seed roles");
  }

  for (const role of APP_ROLES) {
    await db.$executeRaw`
      INSERT INTO "app_quikinsight"."AppRole"
        ("id", "orgId", "appId", "name", "description", "isSystem", "isDefault", "createdAt", "updatedAt")
      VALUES (
        md5(${orgId} || ':' || ${appId} || ':' || ${role.name}),
        ${orgId}, ${appId}, ${role.name}, ${role.description},
        ${role.isSystem}, ${role.isDefault}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      -- Reconcile the grouping flags on re-run rather than DO NOTHING. Orgs
      -- seeded before these were correct still carry isSystem = true on every
      -- role, which puts "viewer" in the Admin Portal's System Roles group.
      -- The description column is deliberately NOT overwritten: an org may
      -- have edited it, and only the grouping flags need reconciling.
      ON CONFLICT ("orgId", "appId", "name") DO UPDATE
        SET "isSystem"  = EXCLUDED."isSystem",
            "isDefault" = EXCLUDED."isDefault",
            "updatedAt" = CURRENT_TIMESTAMP;
    `;
  }

  const rows = await db.$queryRaw<Array<{ id: string; name: string }>>(Prisma.sql`
    SELECT "id", "name"
      FROM "app_quikinsight"."AppRole"
     WHERE "orgId" = ${orgId} AND "appId" = ${appId};
  `);

  const byName = new Map<SeededRole, string>();
  for (const row of rows) byName.set(row.name as SeededRole, row.id);

  // The grants behind those roles. Without them the org has a role catalogue
  // that authorises nothing.
  for (const [name, roleId] of byName) {
    const perms = ROLE_PERMISSIONS[name];
    if (!perms) continue;
    for (const perm of perms) {
      const [resource, action] = perm.split(".");
      await db.$executeRaw`
        INSERT INTO "app_quikinsight"."RolePermission" ("id", "roleId", "resource", "action")
        VALUES (md5(${roleId} || ':' || ${perm}), ${roleId}, ${resource}, ${action})
        ON CONFLICT ("roleId", "resource", "action") DO NOTHING;
      `;
    }
  }

  return byName;
}

/**
 * Put `userId` on exactly `roleName` inside `orgId`, replacing any role they
 * already hold — matching the REPLACE semantics of `assignAppRoles()` in
 * packages/auth, so a promotion/demotion never stacks two roles.
 *
 * QiUserRole is updated in the same call: lib/rbac.ts still reads
 * `session.user.role` from that table, so a UserAppRole row alone would show
 * the right role in the Admin Portal while granting nothing in the app.
 */
export async function ensureUserOnRole(
  userId: string,
  orgId: string,
  roleName: SeededRole,
): Promise<void> {
  const roles = await seedAppRoles(orgId);
  const roleId = roles.get(roleName);
  if (!roleId) {
    throw new Error(`QuikInsight role "${roleName}" not found for org ${orgId}`);
  }

  await db.$executeRaw`
    DELETE FROM "app_quikinsight"."UserAppRole" WHERE "userId" = ${userId} AND "orgId" = ${orgId};
  `;
  await db.$executeRaw`
    INSERT INTO "app_quikinsight"."UserAppRole" ("id", "userId", "orgId", "roleId", "assignedAt")
    VALUES (md5(${userId} || ':' || ${orgId} || ':' || ${roleId}), ${userId}, ${orgId}, ${roleId}, CURRENT_TIMESTAMP)
    ON CONFLICT ("userId", "orgId", "roleId") DO NOTHING;
  `;

  await db.qiUserRole.upsert({
    where:  { userId },
    update: { role: roleName },
    create: { userId, role: roleName },
  });
}

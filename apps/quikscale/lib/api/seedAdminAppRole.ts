/**
 * Default role seeders + legacy backfill for the QuikScale Roles &
 * Permissions v2 system.
 *
 * IMPORTANT — this is no longer just an "admin seed". Per the v2 spec
 * (see apps/quikscale/rolesAndPermissions-AppRole.md and the user's
 * extended spec), admin is now editable like any other role. The
 * `isSystem=true` flag still protects rename/delete but does NOT bypass
 * permission checks. We seed admin with all permissions ticked, and an
 * editable "User" role with a curated default set as the org default.
 *
 * All seeders are idempotent — safe to call from layout.tsx on every
 * request once per process per org, AND from the grant-access path.
 */
import { db } from "@/lib/db";
import {
  ACTIONS,
  NAV_KEYS,
  allPermissionPairs,
  LEGACY_RESOURCE_BACKFILL,
  walkLeaves,
} from "@/lib/api/permissionsRegistry";
import { getQuikScaleAppId } from "@/lib/api/permissions";

/* ───────────────────────── admin role ───────────────────────── */

/**
 * Idempotently create the org's admin AppRole and ensure every
 * (resource, action) pair from the registry is granted + every navKey
 * is whitelisted.
 *
 * Admin permissions remain editable from the UI after seeding — this
 * function only guarantees the row exists and gets a full initial
 * grant set. Subsequent admin un-checks are NOT overwritten on re-run.
 *
 * Returns the admin AppRole.id.
 */
export async function seedAdminAppRole(orgId: string): Promise<string> {
  const appId = await getQuikScaleAppId();
  if (!appId) throw new Error("QuikScale App not registered in quikit.App");

  // 1. Admin AppRole — one per (org, app)
  const existing = await db.appRole.findFirst({
    where: { orgId, appId, name: "admin" },
    select: { id: true },
  });
  const role =
    existing ??
    (await db.appRole.create({
      data: {
        orgId,
        appId,
        name: "admin",
        description:
          "Full access — auto-seeded. Permissions are editable; rename/delete protected.",
        isSystem: true,
        isDefault: false,
      },
      select: { id: true },
    }));

  // Only fill grants if THIS role has zero rows. Avoids re-granting cells
  // an admin has deliberately unchecked.
  const grantCount = await db.rolePermission.count({ where: { roleId: role.id } });
  if (grantCount === 0) {
    const pairs = allPermissionPairs();
    await db.rolePermission.createMany({
      data: pairs.map((p) => ({ roleId: role.id, resource: p.resource, action: p.action })),
      skipDuplicates: true,
    });
  }

  const navCount = await db.roleNavigation.count({ where: { roleId: role.id } });
  if (navCount === 0) {
    await db.roleNavigation.createMany({
      data: NAV_KEYS.map((k) => ({ roleId: role.id, navKey: k })),
      skipDuplicates: true,
    });
  }

  return role.id;
}

/* ───────────────────────── User role ───────────────────────── */

/**
 * Idempotently create the org's default "User" AppRole — a team-member
 * role with curated permissions:
 *   - `view` on every leaf in the tree (so users can navigate freely)
 *   - `update` on KPI, Priority, WWW (the day-to-day work surfaces)
 *
 * Marked `isDefault=true` so new invitees are auto-assigned here.
 * `isSystem=false` so admins can delete/rename freely.
 *
 * Returns the User AppRole.id.
 */
export async function seedUserAppRole(orgId: string): Promise<string> {
  const appId = await getQuikScaleAppId();
  if (!appId) throw new Error("QuikScale App not registered in quikit.App");

  const existing = await db.appRole.findFirst({
    where: { orgId, appId, name: "User" },
    select: { id: true },
  });

  // Demote any other isDefault role first — only one default at a time.
  if (!existing) {
    await db.appRole.updateMany({
      where: { orgId, appId, isDefault: true },
      data: { isDefault: false },
    });
  }

  const role =
    existing ??
    (await db.appRole.create({
      data: {
        orgId,
        appId,
        name: "User",
        description:
          "Default team-member role. View access everywhere; edit on KPI / Priority / WWW.",
        isSystem: false,
        isDefault: true,
      },
      select: { id: true },
    }));

  // Only seed grants when the role has zero rows — never overwrite
  // admin-customized grants on re-run.
  const grantCount = await db.rolePermission.count({ where: { roleId: role.id } });
  if (grantCount === 0) {
    const grants: Array<{ resource: string; action: string }> = [];
    // view on every leaf (skip OPSP.History.EditFinalize — only `update`)
    for (const leaf of walkLeaves()) {
      if ((leaf.actions as readonly string[]).includes("view")) {
        grants.push({ resource: leaf.resource, action: "view" });
      }
    }
    // update on the day-to-day work surfaces only
    for (const resource of ["KPI", "Priority", "WWW"]) {
      grants.push({ resource, action: "update" });
    }
    await db.rolePermission.createMany({
      data: grants.map((g) => ({ roleId: role.id, ...g })),
      skipDuplicates: true,
    });
  }

  const navCount = await db.roleNavigation.count({ where: { roleId: role.id } });
  if (navCount === 0) {
    // Users see the full sidebar by default — admin can prune via UI.
    await db.roleNavigation.createMany({
      data: NAV_KEYS.map((k) => ({ roleId: role.id, navKey: k })),
      skipDuplicates: true,
    });
  }

  return role.id;
}

/* ───────────────────────── legacy backfill ───────────────────────── */

/**
 * Migrate pre-v2 `RolePermission` rows whose `resource` key uses the old
 * flat names (e.g. "OPSP") to the new dot-namespaced keys ("OPSP.Create",
 * "OPSP.History", etc.). See LEGACY_RESOURCE_BACKFILL in the registry.
 *
 * Runs inside a transaction. Idempotent — re-runs are no-ops once all
 * legacy rows have been replaced.
 */
async function backfillLegacyResources(orgId: string): Promise<void> {
  const appId = await getQuikScaleAppId();
  if (!appId) return;

  // Find every legacy row scoped to this org's roles.
  const legacyKeys = Object.keys(LEGACY_RESOURCE_BACKFILL);
  if (legacyKeys.length === 0) return;

  const legacyRows = await db.rolePermission.findMany({
    where: {
      resource: { in: legacyKeys },
      role: { orgId, appId },
    },
    select: { id: true, roleId: true, resource: true, action: true },
  });
  if (legacyRows.length === 0) return;

  await db.$transaction(async (tx) => {
    for (const row of legacyRows) {
      const newResources = LEGACY_RESOURCE_BACKFILL[row.resource] ?? [];
      // Insert new dot-namespaced rows in place of the legacy one.
      for (const newRes of newResources) {
        await tx.rolePermission.upsert({
          where: {
            roleId_resource_action: {
              roleId: row.roleId,
              resource: newRes,
              action: row.action,
            },
          },
          create: { roleId: row.roleId, resource: newRes, action: row.action },
          update: {},
        });
      }
    }
    // Drop all legacy rows once their replacements are in place.
    await tx.rolePermission.deleteMany({
      where: { id: { in: legacyRows.map((r) => r.id) } },
    });
  });
}

/* ───────────────────────── user → role assignment ───────────────────────── */

/**
 * Assign a user to a role via `app_quikscale.UserAppRole`. Idempotent.
 */
export async function ensureUserOnRole(
  userId: string,
  orgId: string,
  roleId: string,
  assignedBy?: string,
): Promise<void> {
  const existing = await db.userAppRole.findFirst({
    where: { userId, orgId, roleId },
    select: { id: true },
  });
  if (existing) return;
  await db.userAppRole.create({
    data: { userId, orgId, roleId, assignedBy: assignedBy ?? null },
  });
}

/* ───────────────────────── orchestrator ───────────────────────── */

/**
 * In-process cache so we don't hammer the DB on every request. Keyed by orgId.
 * 5-minute TTL so admins who add a fresh org get fast subsequent visits but
 * an org that gets created mid-process still seeds on the next request.
 */
const seededOrgs = new Map<string, number>();
const SEED_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Run all default-role seeders + the legacy backfill for this org.
 * Cached per process. Safe to call on every authenticated request.
 *
 * Returns `{ adminRoleId, userRoleId }`.
 */
export async function seedAllDefaultRoles(
  orgId: string,
): Promise<{ adminRoleId: string; userRoleId: string }> {
  const cached = seededOrgs.get(orgId);
  const now = Date.now();
  if (cached && now - cached < SEED_CACHE_TTL_MS) {
    // Cache hit — fetch existing IDs without re-seeding.
    const [admin, user] = await Promise.all([
      db.appRole.findFirst({ where: { orgId, name: "admin" }, select: { id: true } }),
      db.appRole.findFirst({ where: { orgId, name: "User" }, select: { id: true } }),
    ]);
    if (admin && user) return { adminRoleId: admin.id, userRoleId: user.id };
    // Cache stale (rows deleted out-of-band) — fall through to full seed.
  }

  const [adminRoleId, userRoleId] = await Promise.all([
    seedAdminAppRole(orgId),
    seedUserAppRole(orgId),
  ]);
  await backfillLegacyResources(orgId);

  seededOrgs.set(orgId, now);
  return { adminRoleId, userRoleId };
}

// ACTIONS is re-exported for callers that need it inline; the registry
// is the canonical source.
export { ACTIONS };

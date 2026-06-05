/**
 * QuikSocial default-role seeders for the QuikIT RBAC v2 layer.
 *
 * Mirrors apps/quikscale/lib/api/seedAdminAppRole.ts in shape and idempotency
 * guarantees. Two default roles per (org, app):
 *
 *   - "Admin"  → isSystem=true,  isDefault=false. Full grants on every
 *                (resource, action) pair from the registry. Rename/delete
 *                protected by the isSystem flag; permissions remain editable.
 *   - "User"   → isSystem=false, isDefault=true.  View-only grants on every
 *                resource (see USER_DEFAULT_GRANTS in the registry). New
 *                invitees auto-land here.
 *
 * All seeders are safe to call on every authenticated request — the
 * orchestrator (`seedAllDefaultRoles`) caches per orgId for 5 minutes so
 * the real DB work happens once per process per org.
 *
 * No legacy-resource backfill (QuikScale's `LEGACY_RESOURCE_BACKFILL`):
 * QuikSocial starts clean with the v2 registry, no pre-v2 rows to migrate.
 */
import { db } from "@quikit/database";
import {
  ACTIONS,
  USER_DEFAULT_GRANTS,
  allPermissionPairs,
} from "@/lib/rbac/permissionsRegistry";

export const QUIKSOCIAL_APP_SLUG = "quiksocial";

let cachedAppId: string | null = null;

/**
 * Look up the QuikSocial App row id by slug. Cached in-process — the row
 * is created once at platform bootstrap and never moves, so a per-process
 * cache is safe.
 */
export async function getQuikSocialAppId(): Promise<string | null> {
  if (cachedAppId) return cachedAppId;
  const app = await db.app.findUnique({
    where: { slug: QUIKSOCIAL_APP_SLUG },
    select: { id: true },
  });
  if (app) cachedAppId = app.id;
  return cachedAppId;
}

/* ───────────────────────── Admin role ───────────────────────── */

/**
 * Idempotently create the org's Admin QsAppRole + grant every
 * (resource, action) pair from the registry.
 *
 * Admin permissions stay editable in the UI — this function only
 * guarantees the row exists and gets a full initial grant set. Admins
 * who deliberately un-check a cell won't have it re-granted on re-run
 * (the empty-grant gate below).
 *
 * Returns the Admin QsAppRole.id.
 */
export async function seedAdminAppRole(orgId: string): Promise<string> {
  const appId = await getQuikSocialAppId();
  if (!appId) throw new Error("QuikSocial App not registered in quikit.App");

  const existing = await db.qsAppRole.findFirst({
    where: { orgId, appId, name: "Admin" },
    select: { id: true },
  });
  const role =
    existing ??
    (await db.qsAppRole.create({
      data: {
        orgId,
        appId,
        name: "Admin",
        description:
          "Full access — auto-seeded. Permissions are editable; rename/delete protected.",
        isSystem: true,
        isDefault: false,
      },
      select: { id: true },
    }));

  // Only fill grants when this role has zero rows — avoids re-granting
  // cells an admin has deliberately unchecked.
  const grantCount = await db.qsRolePermission.count({ where: { roleId: role.id } });
  if (grantCount === 0) {
    await db.qsRolePermission.createMany({
      data: allPermissionPairs().map((p) => ({
        roleId: role.id,
        resource: p.resource,
        action: p.action,
      })),
      skipDuplicates: true,
    });
  }

  return role.id;
}

/**
 * Top up the Admin role with any (resource, action) pair that exists in
 * the current registry but is missing on the row. Runs every seed pass
 * so admins of existing orgs gain access to newly added resources
 * without manual editing.
 *
 * Only touches the Admin row; user-created roles keep their deliberate
 * un-checks.
 */
export async function backfillAdminPermissions(orgId: string): Promise<void> {
  const appId = await getQuikSocialAppId();
  if (!appId) return;

  const admin = await db.qsAppRole.findFirst({
    where: { orgId, appId, isSystem: true, name: "Admin" },
    select: {
      id: true,
      permissions: { select: { resource: true, action: true } },
    },
  });
  if (!admin) return;

  const have = new Set(admin.permissions.map((p) => `${p.resource}:${p.action}`));
  const missing = allPermissionPairs().filter(
    (p) => !have.has(`${p.resource}:${p.action}`),
  );
  if (missing.length === 0) return;

  await db.qsRolePermission.createMany({
    data: missing.map((p) => ({
      roleId: admin.id,
      resource: p.resource,
      action: p.action,
    })),
    skipDuplicates: true,
  });
}

/* ───────────────────────── User role ───────────────────────── */

/**
 * Idempotently create the org's default "User" QsAppRole — view-only on
 * every resource. Marked `isDefault=true` so new invitees auto-land here.
 * `isSystem=false` so admins can rename or delete freely.
 *
 * Returns the User QsAppRole.id.
 */
export async function seedUserAppRole(orgId: string): Promise<string> {
  const appId = await getQuikSocialAppId();
  if (!appId) throw new Error("QuikSocial App not registered in quikit.App");

  const existing = await db.qsAppRole.findFirst({
    where: { orgId, appId, name: "User" },
    select: { id: true },
  });

  // Demote any other isDefault role first — one default per (org, app).
  if (!existing) {
    await db.qsAppRole.updateMany({
      where: { orgId, appId, isDefault: true },
      data: { isDefault: false },
    });
  }

  const role =
    existing ??
    (await db.qsAppRole.create({
      data: {
        orgId,
        appId,
        name: "User",
        description:
          "Default team-member role. View-only on every QuikSocial surface.",
        isSystem: false,
        isDefault: true,
      },
      select: { id: true },
    }));

  // Only seed grants when the role has zero rows — `backfillUserPermissions`
  // covers the top-up case for existing orgs.
  const grantCount = await db.qsRolePermission.count({ where: { roleId: role.id } });
  if (grantCount === 0) {
    await db.qsRolePermission.createMany({
      data: USER_DEFAULT_GRANTS.map((g) => ({
        roleId: role.id,
        resource: g.resource,
        action: g.action,
      })),
      skipDuplicates: true,
    });
  }

  return role.id;
}

/**
 * Top up the User role with any pair in `USER_DEFAULT_GRANTS` that's
 * missing on the row. Used when the curated default set expands so
 * existing orgs converge without admins having to re-tick every cell.
 *
 * Only ADDS rows. Admin un-checks that fall outside the default set
 * survive; default-set entries an admin deliberately un-ticked WILL be
 * re-added on the next pass — that's the price of the convergence
 * guarantee.
 */
export async function backfillUserPermissions(orgId: string): Promise<void> {
  const appId = await getQuikSocialAppId();
  if (!appId) return;

  const user = await db.qsAppRole.findFirst({
    where: { orgId, appId, name: "User", isSystem: false },
    select: {
      id: true,
      permissions: { select: { resource: true, action: true } },
    },
  });
  if (!user) return;

  const have = new Set(user.permissions.map((p) => `${p.resource}:${p.action}`));
  const missing = USER_DEFAULT_GRANTS.filter(
    (g) => !have.has(`${g.resource}:${g.action}`),
  );
  if (missing.length === 0) return;

  await db.qsRolePermission.createMany({
    data: missing.map((g) => ({
      roleId: user.id,
      resource: g.resource,
      action: g.action,
    })),
    skipDuplicates: true,
  });
}

/* ───────────────────── User → role assignment ───────────────────── */

/**
 * Assign a user to a role via `app_quiksocial.UserAppRole`. Idempotent —
 * findFirst-then-create instead of upsert because the unique key is
 * composite and we don't have anything to update on a hit.
 */
export async function ensureUserOnRole(
  userId: string,
  orgId: string,
  roleId: string,
  assignedBy?: string,
): Promise<void> {
  const existing = await db.qsUserAppRole.findFirst({
    where: { userId, orgId, roleId },
    select: { id: true },
  });
  if (existing) return;
  await db.qsUserAppRole.create({
    data: { userId, orgId, roleId, assignedBy: assignedBy ?? null },
  });
}

/* ───────────────────────── Orchestrator ───────────────────────── */

/**
 * In-process cache so we don't hammer the DB on every request. Keyed by
 * orgId. 5-minute TTL — admins who add a fresh org get fast subsequent
 * visits but an org created mid-process still seeds on the next request.
 */
const seededOrgs = new Map<string, number>();
const SEED_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Run both default-role seeders + the backfills for this org. Cached
 * per process. Safe to call on every authenticated request.
 *
 * Returns `{ adminRoleId, userRoleId }`.
 */
export async function seedAllDefaultRoles(
  orgId: string,
): Promise<{ adminRoleId: string; userRoleId: string }> {
  const cached = seededOrgs.get(orgId);
  const now = Date.now();
  if (cached && now - cached < SEED_CACHE_TTL_MS) {
    const [admin, user] = await Promise.all([
      db.qsAppRole.findFirst({ where: { orgId, name: "Admin" }, select: { id: true } }),
      db.qsAppRole.findFirst({ where: { orgId, name: "User" }, select: { id: true } }),
    ]);
    if (admin && user) return { adminRoleId: admin.id, userRoleId: user.id };
    // Cache stale (rows deleted out-of-band) — fall through to full seed.
  }

  const [adminRoleId, userRoleId] = await Promise.all([
    seedAdminAppRole(orgId),
    seedUserAppRole(orgId),
  ]);
  await backfillAdminPermissions(orgId);
  await backfillUserPermissions(orgId);

  seededOrgs.set(orgId, now);
  return { adminRoleId, userRoleId };
}

// ACTIONS re-exported for inline callers; the registry remains the canonical source.
export { ACTIONS };

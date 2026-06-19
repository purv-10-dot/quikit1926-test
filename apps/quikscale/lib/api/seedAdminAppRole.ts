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
  allPermissionPairs,
  LEGACY_RESOURCE_BACKFILL,
} from "@/lib/api/permissionsRegistry";

/**
 * Member role's curated default grants. Used by both `seedMemberAppRole`
 * (on fresh orgs) and `backfillMemberPermissions` (to top up existing
 * Member rows when defaults expand). One place to evolve the spec.
 */
const MEMBER_DEFAULT_GRANTS: Array<{ resource: string; action: string }> = [
  // Dashboard view so the sidebar landing is reachable.
  { resource: "Dashboard", action: "view" },
  // Full CRUDV on the day-to-day work surfaces.
  ...["KPI", "TeamKPI", "Priority", "WWW"].flatMap((resource) =>
    (["view", "create", "update", "delete"] as const).map((action) => ({ resource, action })),
  ),
];

/**
 * (resource, action) pairs that exist in the registry but are intentionally
 * NOT granted to admin by default. Admins can still tick these cells in the
 * Role Permission Matrix UI to enable them — they're just opt-in instead of
 * opt-out.
 *
 * `OPSP.History.EditFinalize:update` is the only entry today: editing a
 * finalized/reviewed OPSP is a destructive action (it bypasses the lock
 * that the Finalize step puts on the document), so admins should make a
 * deliberate choice to enable it rather than getting it for free.
 */
const ADMIN_DEFAULT_EXCLUSIONS = new Set<string>([
  "OPSP.History.EditFinalize:update",
]);
import { getQuikScaleAppId } from "@/lib/api/permissions";

/* ───────────────────────── admin role ───────────────────────── */

/**
 * Idempotently create the org's admin AppRole and ensure every
 * (resource, action) pair from the registry is granted.
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
    const pairs = allPermissionPairs().filter(
      (p) => !ADMIN_DEFAULT_EXCLUSIONS.has(`${p.resource}:${p.action}`),
    );
    await db.rolePermission.createMany({
      data: pairs.map((p) => ({ roleId: role.id, resource: p.resource, action: p.action })),
      skipDuplicates: true,
    });
  }

  return role.id;
}

/**
 * Top up the admin role with any (resource, action) pairs that exist in
 * the current registry but are missing on the row. Runs every seed pass
 * so admins of existing orgs gain access to newly added resources (e.g.
 * Analytics, People, ClientMeetings.Dashboard) without manual editing.
 *
 * Only touches the admin row — user-created roles keep their deliberate
 * un-checks. No-op when admin already has every current pair.
 */
export async function backfillAdminPermissions(orgId: string): Promise<void> {
  const appId = await getQuikScaleAppId();
  if (!appId) return;

  const admin = await db.appRole.findFirst({
    where: { orgId, appId, isSystem: true, name: "admin" },
    select: { id: true, permissions: { select: { resource: true, action: true } } },
  });
  if (!admin) return;

  const have = new Set(admin.permissions.map((p) => `${p.resource}:${p.action}`));
  const missing = allPermissionPairs().filter((p) => {
    const key = `${p.resource}:${p.action}`;
    return !have.has(key) && !ADMIN_DEFAULT_EXCLUSIONS.has(key);
  });
  if (missing.length === 0) return;

  await db.rolePermission.createMany({
    data: missing.map((p) => ({ roleId: admin.id, resource: p.resource, action: p.action })),
    skipDuplicates: true,
  });
}

/* ───────────────────────── Member role ───────────────────────── */

/**
 * Rename the legacy "User" role to "Member" for existing orgs. Idempotent:
 * skips when a "Member" row already exists, or when no "User" row is
 * present. Only touches user-created (isSystem=false) rows, so the admin
 * row is safe.
 *
 * Permissions are NOT changed by the rename — the existing grants on the
 * renamed row are preserved. `backfillMemberPermissions` then tops the
 * row up with any missing entries from `MEMBER_DEFAULT_GRANTS`.
 */
export async function migrateUserToMember(orgId: string): Promise<void> {
  const appId = await getQuikScaleAppId();
  if (!appId) return;

  const member = await db.appRole.findFirst({
    where: { orgId, appId, name: "Member" },
    select: { id: true },
  });
  if (member) return;

  await db.appRole.updateMany({
    where: { orgId, appId, name: "User", isSystem: false },
    data: { name: "Member" },
  });
}

/**
 * Idempotently create the org's default "Member" AppRole — a narrowly
 * scoped team-member role with full CRUDV on the day-to-day work
 * surfaces (KPI, TeamKPI, Priority, WWW) plus Dashboard:view so the
 * sidebar lands correctly.
 *
 * Marked `isDefault=true` so new invitees are auto-assigned here.
 * `isSystem=false` so admins can rename/delete freely.
 *
 * Returns the Member AppRole.id.
 */
export async function seedMemberAppRole(orgId: string): Promise<string> {
  const appId = await getQuikScaleAppId();
  if (!appId) throw new Error("QuikScale App not registered in quikit.App");

  const existing = await db.appRole.findFirst({
    where: { orgId, appId, name: "Member" },
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
        name: "Member",
        description:
          "Default team-member role. Full access on KPI / Team KPI / Priority / WWW.",
        isSystem: false,
        isDefault: true,
      },
      select: { id: true },
    }));

  // Only seed grants when the role has zero rows — `backfillMemberPermissions`
  // covers the top-up case below.
  const grantCount = await db.rolePermission.count({ where: { roleId: role.id } });
  if (grantCount === 0) {
    await db.rolePermission.createMany({
      data: MEMBER_DEFAULT_GRANTS.map((g) => ({ roleId: role.id, ...g })),
      skipDuplicates: true,
    });
  }

  return role.id;
}

/**
 * Top up the Member role with any pair in `MEMBER_DEFAULT_GRANTS` that's
 * missing on the row. Used when the curated default set expands (e.g.
 * gaining `create`/`delete` after originally being view+update only) so
 * existing orgs converge without admins having to re-tick every cell.
 *
 * Only ever ADDS rows — admin un-checks that fall outside the default
 * set survive. Default-set entries that an admin deliberately un-ticked
 * WILL be re-added on the next pass; that's the price of the convergence
 * guarantee.
 */
export async function backfillMemberPermissions(orgId: string): Promise<void> {
  const appId = await getQuikScaleAppId();
  if (!appId) return;

  const member = await db.appRole.findFirst({
    where: { orgId, appId, name: "Member", isSystem: false },
    select: { id: true, permissions: { select: { resource: true, action: true } } },
  });
  if (!member) return;

  const have = new Set(member.permissions.map((p) => `${p.resource}:${p.action}`));
  const missing = MEMBER_DEFAULT_GRANTS.filter(
    (g) => !have.has(`${g.resource}:${g.action}`),
  );
  if (missing.length === 0) return;

  await db.rolePermission.createMany({
    data: missing.map((g) => ({ roleId: member.id, ...g })),
    skipDuplicates: true,
  });
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
 * Returns `{ adminRoleId, userRoleId }` — `userRoleId` holds the Member
 * role id (field name kept for backwards compatibility with callers).
 */
export async function seedAllDefaultRoles(
  orgId: string,
): Promise<{ adminRoleId: string; userRoleId: string }> {
  const cached = seededOrgs.get(orgId);
  const now = Date.now();
  if (cached && now - cached < SEED_CACHE_TTL_MS) {
    // Cache hit — fetch existing IDs without re-seeding.
    const [admin, member] = await Promise.all([
      db.appRole.findFirst({ where: { orgId, name: "admin" }, select: { id: true } }),
      db.appRole.findFirst({ where: { orgId, name: "Member" }, select: { id: true } }),
    ]);
    if (admin && member) return { adminRoleId: admin.id, userRoleId: member.id };
    // Cache stale (rows deleted out-of-band) — fall through to full seed.
  }

  // Rename any legacy "User" row to "Member" before the Member seeder runs,
  // so existing orgs converge on the new name without duplicating rows.
  await migrateUserToMember(orgId);

  const [adminRoleId, userRoleId] = await Promise.all([
    seedAdminAppRole(orgId),
    seedMemberAppRole(orgId),
  ]);
  await backfillLegacyResources(orgId);
  await backfillAdminPermissions(orgId);
  await backfillMemberPermissions(orgId);

  seededOrgs.set(orgId, now);
  return { adminRoleId, userRoleId };
}

// ACTIONS is re-exported for callers that need it inline; the registry
// is the canonical source.
export { ACTIONS };

/**
 * Default role seeders for the QuikFlow Roles & Permissions v2 system.
 *
 * Admin is editable like any other role — the `isSystem=true` flag only
 * protects rename/delete, it does NOT bypass permission checks. We seed
 * admin with every (resource, action) pair ticked, and an editable "Member"
 * role with a curated default set as the org default.
 *
 * All seeders are idempotent — safe to call from any authenticated request,
 * AND from the grant-access provisioning path.
 *
 * Mirrors apps/quikscale/lib/api/seedAdminAppRole.ts.
 */
import { db } from "@/lib/db";
import { ACTIONS, allPermissionPairs } from "@/lib/api/permissionsRegistry";
import { MEMBER_DEFAULT_GRANTS } from "@/lib/api/memberDefaults";
import { getQuikFlowAppId } from "@/lib/api/permissions";

export { MEMBER_DEFAULT_GRANTS };

/* ───────────────────────── admin role ───────────────────────── */

/**
 * Idempotently create the org's admin AppRole and ensure every
 * (resource, action) pair from the registry is granted.
 *
 * Permissions remain editable from the UI after seeding — this function
 * only guarantees the row exists and gets a full initial grant set.
 * Subsequent admin un-checks are NOT overwritten on re-run.
 *
 * Returns the admin AppRole.id.
 */
export async function seedAdminAppRole(orgId: string): Promise<string> {
  const appId = await getQuikFlowAppId();
  if (!appId) throw new Error("QuikFlow App not registered in quikit.App");

  const existing = await db.wfAppRole.findFirst({
    where: { orgId, appId, name: "admin" },
    select: { id: true },
  });
  const role =
    existing ??
    (await db.wfAppRole.create({
      data: {
        orgId,
        appId,
        name: "admin",
        description: "Full access — auto-seeded. Permissions are editable; rename/delete protected.",
        isSystem: true,
        // Default role for new QuikFlow invitees/grants, per product decision
        // — new members land as admin rather than the narrower Member role.
        isDefault: true,
      },
      select: { id: true },
    }));

  // Only fill grants if THIS role has zero rows. Avoids re-granting cells
  // an admin has deliberately unchecked.
  const grantCount = await db.wfRolePermission.count({ where: { roleId: role.id } });
  if (grantCount === 0) {
    const pairs = allPermissionPairs();
    await db.wfRolePermission.createMany({
      data: pairs.map((p) => ({ roleId: role.id, resource: p.resource, action: p.action })),
      skipDuplicates: true,
    });
  }

  return role.id;
}

/**
 * Top up the admin role with any (resource, action) pairs that exist in the
 * current registry but are missing on the row. Runs every seed pass so
 * admins of existing orgs gain access to newly added resources without
 * manual editing. No-op when admin already has every current pair.
 */
export async function backfillAdminPermissions(orgId: string): Promise<void> {
  const appId = await getQuikFlowAppId();
  if (!appId) return;

  const admin = await db.wfAppRole.findFirst({
    where: { orgId, appId, isSystem: true, name: "admin" },
    select: { id: true, permissions: { select: { resource: true, action: true } } },
  });
  if (!admin) return;

  const have = new Set(admin.permissions.map((p) => `${p.resource}:${p.action}`));
  const missing = allPermissionPairs().filter((p) => !have.has(`${p.resource}:${p.action}`));
  if (missing.length === 0) return;

  await db.wfRolePermission.createMany({
    data: missing.map((p) => ({ roleId: admin.id, resource: p.resource, action: p.action })),
    skipDuplicates: true,
  });
}

/* ───────────────────────── Member role ───────────────────────── */

/**
 * Idempotently create the org's narrower "Member" AppRole with the curated
 * `MEMBER_DEFAULT_GRANTS`. Not the default role — see seedAdminAppRole's
 * `isDefault: true` — an admin assigns Member deliberately when they want
 * someone scoped down from full access. `isSystem=false` so admins can
 * rename/delete freely.
 *
 * Returns the Member AppRole.id.
 */
export async function seedMemberAppRole(orgId: string): Promise<string> {
  const appId = await getQuikFlowAppId();
  if (!appId) throw new Error("QuikFlow App not registered in quikit.App");

  const existing = await db.wfAppRole.findFirst({
    where: { orgId, appId, name: "Member" },
    select: { id: true },
  });

  const role =
    existing ??
    (await db.wfAppRole.create({
      data: {
        orgId,
        appId,
        name: "Member",
        description: "Narrower team-member role. Author/edit own workflows, view runs & templates.",
        isSystem: false,
        // admin is the seeded default (see seedAdminAppRole) — Member is an
        // opt-in narrower role an admin assigns deliberately.
        isDefault: false,
      },
      select: { id: true },
    }));

  const grantCount = await db.wfRolePermission.count({ where: { roleId: role.id } });
  if (grantCount === 0) {
    await db.wfRolePermission.createMany({
      data: MEMBER_DEFAULT_GRANTS.map((g) => ({ roleId: role.id, ...g })),
      skipDuplicates: true,
    });
  }

  return role.id;
}

/**
 * Top up the Member role with any pair in `MEMBER_DEFAULT_GRANTS` that's
 * missing on the row. Only ever ADDS rows — admin un-checks that fall
 * outside the default set survive.
 */
export async function backfillMemberPermissions(orgId: string): Promise<void> {
  const appId = await getQuikFlowAppId();
  if (!appId) return;

  const member = await db.wfAppRole.findFirst({
    where: { orgId, appId, name: "Member", isSystem: false },
    select: { id: true, permissions: { select: { resource: true, action: true } } },
  });
  if (!member) return;

  const have = new Set(member.permissions.map((p) => `${p.resource}:${p.action}`));
  const missing = MEMBER_DEFAULT_GRANTS.filter((g) => !have.has(`${g.resource}:${g.action}`));
  if (missing.length === 0) return;

  await db.wfRolePermission.createMany({
    data: missing.map((g) => ({ roleId: member.id, ...g })),
    skipDuplicates: true,
  });
}

/* ───────────────────────── user → role assignment ───────────────────────── */

/** Assign a user to a role via `app_quikflow.UserAppRole`. Idempotent. */
export async function ensureUserOnRole(
  userId: string,
  orgId: string,
  roleId: string,
  assignedBy?: string,
): Promise<void> {
  const existing = await db.wfUserAppRole.findFirst({
    where: { userId, orgId, roleId },
    select: { id: true },
  });
  if (existing) return;
  await db.wfUserAppRole.create({
    data: { userId, orgId, roleId, assignedBy: assignedBy ?? null },
  });
}

/**
 * Enforce the single-role-per-user invariant for QuikFlow. The Admin Portal
 * write path (shared `@quikit/auth` `assignAppRoles`) only INSERTs on a role
 * change — it never deletes the previous row — so a stale role could keep
 * winning. Called from `/api/me/permissions` on every mount; keeps the most
 * recently assigned role and deletes the rest. Idempotent. Returns the
 * number of stale rows removed.
 */
export async function collapseToLatestRole(userId: string, orgId: string): Promise<number> {
  const appId = await getQuikFlowAppId();
  if (!appId) return 0;

  const roles = await db.wfUserAppRole.findMany({
    where: { userId, orgId, role: { appId } },
    select: { id: true },
    orderBy: { assignedAt: "desc" },
  });
  if (roles.length <= 1) return 0;

  const staleIds = roles.slice(1).map((r) => r.id);
  await db.wfUserAppRole.deleteMany({ where: { id: { in: staleIds } } });
  return staleIds.length;
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
 * Run all default-role seeders for this org. Cached per process. Safe to
 * call on every authenticated request.
 *
 * Returns `{ adminRoleId, userRoleId }` — `userRoleId` holds the Member role
 * id (field name kept consistent with QuikScale's seeder for parity).
 */
export async function seedAllDefaultRoles(
  orgId: string,
): Promise<{ adminRoleId: string; userRoleId: string }> {
  const cached = seededOrgs.get(orgId);
  const now = Date.now();
  if (cached && now - cached < SEED_CACHE_TTL_MS) {
    const [admin, member] = await Promise.all([
      db.wfAppRole.findFirst({ where: { orgId, name: "admin" }, select: { id: true } }),
      db.wfAppRole.findFirst({ where: { orgId, name: "Member" }, select: { id: true } }),
    ]);
    if (admin && member) return { adminRoleId: admin.id, userRoleId: member.id };
    // Cache stale (rows deleted out-of-band) — fall through to full seed.
  }

  const [adminRoleId, userRoleId] = await Promise.all([
    seedAdminAppRole(orgId),
    seedMemberAppRole(orgId),
  ]);
  await backfillAdminPermissions(orgId);
  await backfillMemberPermissions(orgId);

  seededOrgs.set(orgId, now);
  return { adminRoleId, userRoleId };
}

export { ACTIONS };

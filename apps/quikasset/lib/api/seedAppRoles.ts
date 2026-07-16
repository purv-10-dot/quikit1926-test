/**
 * Default role seeders for QuikAsset's RBAC system. Idempotent — safe to call
 * on every authenticated request (cached per process, 5-min TTL) and from the
 * grant-access path.
 *
 *   - admin  (isSystem=true)  → every (resource, action) pair. Editable in the
 *                               UI; the flag only protects rename/delete.
 *   - Member (isDefault=true) → curated day-to-day grants; auto-assigned to
 *                               new users.
 */
import { db } from "@/lib/db";
import { allPermissionPairs, type Resource, type Action } from "@/lib/api/permissionsRegistry";
import { getQuikAssetAppId } from "@/lib/api/permissions";
import { mirrorAppRoleToCentral } from "@quikit/auth/assign-app-roles";

/**
 * Member role's curated default grants (BRD Phase 0).
 *
 * A Member may only VIEW the assets assigned to them (row-scoping enforced in
 * the route layer via `Asset:viewAll` — which Members deliberately do NOT hold)
 * and see their own notifications. They may also raise asset requests and see
 * their own (`AssetRequest:view`, NOT `viewAll` — which reveals the approver
 * queue). Everything else — the full register, other users' data, categories,
 * assignments, repairs, reports, budgets, settings — is withheld.
 *
 * NOTE: seeding is additive-only (backfill never removes). Trimming this list
 * does NOT revoke grants on orgs already seeded — run
 * `scripts/trim-member-permissions.ts` to strip the legacy over-grants. Keep
 * this in sync with `MEMBER_GRANTS` (scripts/seed-app.ts) and the `ALLOWED`
 * set (scripts/trim-member-permissions.ts).
 */
const MEMBER_DEFAULT_GRANTS: Array<{ resource: Resource; action: Action }> = [
  { resource: "Asset", action: "view" },
  { resource: "Notification", action: "view" },
  { resource: "AssetRequest", action: "view" },
  { resource: "AssetRequest", action: "create" },
];

/* ───────────────────────── admin role ───────────────────────── */

export async function seedAdminAppRole(orgId: string): Promise<string> {
  const appId = await getQuikAssetAppId();
  if (!appId) throw new Error("QuikAsset App not registered in quikit.App");

  const existing = await db.astAppRole.findFirst({
    where: { orgId, appId, name: "admin" },
    select: { id: true },
  });
  const role =
    existing ??
    (await db.astAppRole.create({
      data: {
        orgId,
        appId,
        name: "admin",
        description: "Full access — auto-seeded. Permissions editable; rename/delete protected.",
        isSystem: true,
        isDefault: false,
      },
      select: { id: true },
    }));

  const grantCount = await db.astRolePermission.count({ where: { roleId: role.id } });
  if (grantCount === 0) {
    await db.astRolePermission.createMany({
      data: allPermissionPairs().map((p) => ({ roleId: role.id, resource: p.resource, action: p.action })),
      skipDuplicates: true,
    });
  }
  return role.id;
}

/** Top up admin with any registry pairs missing on the row (new resources). */
export async function backfillAdminPermissions(orgId: string): Promise<void> {
  const appId = await getQuikAssetAppId();
  if (!appId) return;

  const admin = await db.astAppRole.findFirst({
    where: { orgId, appId, isSystem: true, name: "admin" },
    select: { id: true, permissions: { select: { resource: true, action: true } } },
  });
  if (!admin) return;

  const have = new Set(admin.permissions.map((p) => `${p.resource}:${p.action}`));
  const missing = allPermissionPairs().filter((p) => !have.has(`${p.resource}:${p.action}`));
  if (missing.length === 0) return;

  await db.astRolePermission.createMany({
    data: missing.map((p) => ({ roleId: admin.id, resource: p.resource, action: p.action })),
    skipDuplicates: true,
  });
}

/* ───────────────────────── Member role ───────────────────────── */

export async function seedMemberAppRole(orgId: string): Promise<string> {
  const appId = await getQuikAssetAppId();
  if (!appId) throw new Error("QuikAsset App not registered in quikit.App");

  const existing = await db.astAppRole.findFirst({
    where: { orgId, appId, name: "Member" },
    select: { id: true },
  });

  if (!existing) {
    await db.astAppRole.updateMany({
      where: { orgId, appId, isDefault: true },
      data: { isDefault: false },
    });
  }

  const role =
    existing ??
    (await db.astAppRole.create({
      data: {
        orgId,
        appId,
        name: "Member",
        description: "Default team-member role. Day-to-day asset operations.",
        isSystem: false,
        isDefault: true,
      },
      select: { id: true },
    }));

  const grantCount = await db.astRolePermission.count({ where: { roleId: role.id } });
  if (grantCount === 0) {
    await db.astRolePermission.createMany({
      data: MEMBER_DEFAULT_GRANTS.map((g) => ({ roleId: role.id, ...g })),
      skipDuplicates: true,
    });
  }
  return role.id;
}

export async function backfillMemberPermissions(orgId: string): Promise<void> {
  const appId = await getQuikAssetAppId();
  if (!appId) return;

  const member = await db.astAppRole.findFirst({
    where: { orgId, appId, name: "Member", isSystem: false },
    select: { id: true, permissions: { select: { resource: true, action: true } } },
  });
  if (!member) return;

  const have = new Set(member.permissions.map((p) => `${p.resource}:${p.action}`));
  const missing = MEMBER_DEFAULT_GRANTS.filter((g) => !have.has(`${g.resource}:${g.action}`));
  if (missing.length === 0) return;

  await db.astRolePermission.createMany({
    data: missing.map((g) => ({ roleId: member.id, ...g })),
    skipDuplicates: true,
  });
}

/* ───────────────────────── user → role assignment ───────────────────────── */

export async function ensureUserOnRole(
  userId: string,
  orgId: string,
  roleId: string,
  assignedBy?: string,
): Promise<void> {
  const existing = await db.astUserAppRole.findFirst({
    where: { userId, orgId, roleId },
    select: { id: true },
  });
  if (existing) return;
  await db.astUserAppRole.create({
    data: { userId, orgId, roleId, assignedBy: assignedBy ?? null },
  });

  // Keep the central UserAppAccess.role mirror (what the Admin Portal shows)
  // in sync with the QuikAsset app role just assigned.
  const [role, appId] = await Promise.all([
    db.astAppRole.findUnique({ where: { id: roleId }, select: { name: true } }),
    getQuikAssetAppId(),
  ]);
  if (appId) {
    await mirrorAppRoleToCentral(db, { orgId, userId, appId, roleName: role?.name });
  }
}

/* ───────────────────────── orchestrator ───────────────────────── */

const seededOrgs = new Map<string, number>();
const SEED_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Run all default-role seeders for this org. Cached per process. Safe to call
 * on every authenticated request. Returns `{ adminRoleId, memberRoleId }`.
 */
export async function seedAllDefaultRoles(
  orgId: string,
): Promise<{ adminRoleId: string; memberRoleId: string }> {
  const now = Date.now();
  const cached = seededOrgs.get(orgId);
  if (cached && now - cached < SEED_CACHE_TTL_MS) {
    const [admin, member] = await Promise.all([
      db.astAppRole.findFirst({ where: { orgId, name: "admin" }, select: { id: true } }),
      db.astAppRole.findFirst({ where: { orgId, name: "Member" }, select: { id: true } }),
    ]);
    if (admin && member) return { adminRoleId: admin.id, memberRoleId: member.id };
  }

  const [adminRoleId, memberRoleId] = await Promise.all([
    seedAdminAppRole(orgId),
    seedMemberAppRole(orgId),
  ]);
  await backfillAdminPermissions(orgId);
  await backfillMemberPermissions(orgId);

  seededOrgs.set(orgId, now);
  return { adminRoleId, memberRoleId };
}

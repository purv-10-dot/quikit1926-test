/**
 * Admin self-lockout guard for the dynamic-roles v2 system.
 *
 * The v2 model removed the `isSystem` bypass on the admin role — admin
 * permissions are now editable like any other role. The downside: a
 * negligent admin can revoke their own access by either:
 *   (a) un-checking every permission on the admin role, or
 *   (b) removing the last admin member from the role.
 *
 * Mitigation (a) is enforced by `userCan` itself — a fully-empty admin
 * role just behaves like a no-grants role. The UI surfaces a warning.
 *
 * Mitigation (b) — that's what this module enforces. Any operation that
 * would leave 0 users on the org's admin role throws a structured error
 * so the calling route can return 409 + a friendly message.
 *
 * Wire it into:
 *   - `PATCH /api/org/users/[id]/role`         (admin demotion)
 *   - `PUT   /api/org/roles/[id]/members`      (member reconcile)
 *   - `DELETE /api/org/roles/[id]`             (already blocks isSystem, but
 *                                               also block if members > 0)
 */
import { db } from "@/lib/db";
import { getQuikScaleAppId } from "@/lib/api/permissions";

export class AdminLockoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminLockoutError";
  }
}

/**
 * Resolve the org's admin AppRole id (`isSystem=true, name="admin"`).
 * Returns `null` when no admin role exists yet (e.g. brand-new org that
 * hasn't been seeded). Callers should treat null as "nothing to guard".
 */
async function getAdminRoleId(orgId: string): Promise<string | null> {
  const appId = await getQuikScaleAppId();
  if (!appId) return null;
  const admin = await db.appRole.findFirst({
    where: { orgId, appId, name: "admin", isSystem: true },
    select: { id: true },
  });
  return admin?.id ?? null;
}

/**
 * Refuse if removing `userId` from the admin role would leave 0 admins.
 *
 * Wire this into `PATCH /api/org/users/[id]/role` BEFORE the role swap,
 * and into `PUT /api/org/roles/[id]/members` BEFORE the reconcile.
 *
 * No-ops when:
 *   - the org has no admin role yet (not seeded), or
 *   - `userId` doesn't currently hold the admin role (nothing to remove).
 */
export async function assertWouldNotEmptyAdmin(opts: {
  orgId: string;
  /** The user about to lose the admin role. */
  userId: string;
}): Promise<void> {
  const adminRoleId = await getAdminRoleId(opts.orgId);
  if (!adminRoleId) return;

  // Is this user actually currently an admin?
  const isCurrentlyAdmin = await db.userAppRole.findFirst({
    where: { orgId: opts.orgId, userId: opts.userId, roleId: adminRoleId },
    select: { id: true },
  });
  if (!isCurrentlyAdmin) return;

  const remaining = await db.userAppRole.count({
    where: {
      orgId: opts.orgId,
      roleId: adminRoleId,
      userId: { not: opts.userId },
    },
  });
  if (remaining === 0) {
    throw new AdminLockoutError(
      "Cannot remove the last administrator. Assign another user to the admin role first.",
    );
  }
}

/**
 * Refuse if the set of `nextUserIds` would leave the admin role with 0
 * members. Used by `PUT /api/org/roles/[id]/members` when reconciling
 * the membership list for the admin role specifically.
 *
 * No-op when the role being reconciled is NOT the admin role.
 */
export async function assertReconcileLeavesAdminPopulated(opts: {
  orgId: string;
  roleId: string;
  /** The userIds that the request says SHOULD be on this role after reconcile. */
  nextUserIds: string[];
}): Promise<void> {
  const adminRoleId = await getAdminRoleId(opts.orgId);
  if (!adminRoleId || adminRoleId !== opts.roleId) return;

  if (opts.nextUserIds.length === 0) {
    throw new AdminLockoutError(
      "Cannot reconcile the admin role to an empty member list. Keep at least one administrator.",
    );
  }
}

/**
 * Refuse role deletion when:
 *   - the role is the admin role (already protected by `isSystem` check
 *     in the existing route, but we re-enforce here defensively), OR
 *   - the role has 1+ members (deleting cascades the `UserAppRole` rows
 *     and could orphan users).
 *
 * Returns the count of members that would lose access if forced, so the
 * caller can render the confirm dialog with that number.
 */
export async function assertRoleDeletable(opts: {
  orgId: string;
  roleId: string;
}): Promise<{ memberCount: number }> {
  const role = await db.appRole.findUnique({
    where: { id: opts.roleId },
    select: { isSystem: true, name: true, orgId: true },
  });
  if (!role || role.orgId !== opts.orgId) {
    throw new AdminLockoutError("Role not found in this organization.");
  }
  if (role.isSystem) {
    throw new AdminLockoutError("Cannot delete a system role.");
  }
  const memberCount = await db.userAppRole.count({ where: { roleId: opts.roleId } });
  return { memberCount };
}

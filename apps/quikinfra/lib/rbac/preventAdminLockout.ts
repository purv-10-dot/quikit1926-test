/**
 * QuikInfra — admin lockout guards.
 *
 * v2 RBAC has no admin bypass, so a careless admin can revoke themselves
 * out of the system. These guards refuse the destructive operation.
 *
 *   - assertWouldNotEmptyAdmin               → blocks demoting the only admin
 *   - assertReconcileLeavesAdminPopulated    → blocks reconciling admin to []
 *   - assertRoleDeletable                    → blocks deleting a system role
 *                                              + returns member count for confirms
 *
 * Mirrors apps/quikscale/lib/api/preventAdminLockout.ts.
 */

import { db } from "@quikit/database";
import { getQuikInfraAppId } from "./userCan";

export class AdminLockoutError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "AdminLockoutError";
  }
}

/**
 * Refuse to demote the only remaining admin in this org. Called from the
 * per-user role-swap endpoint BEFORE writing the new assignment.
 *
 * Logic:
 *   - Find the admin AppRole for this org (isSystem && name === "admin").
 *   - If `userId` is currently on that role, AND no OTHER user is on it,
 *     throw — the swap would leave the admin role empty.
 */
export async function assertWouldNotEmptyAdmin(args: {
  orgId: string;
  userId: string;
}): Promise<void> {
  const { orgId, userId } = args;

  const appId = await getQuikInfraAppId();
  if (!appId) return; // app row missing — fail open; route-level guards still apply

  const adminRole = await db.cnAppRole.findFirst({
    where: { orgId, appId, isSystem: true, name: "admin" },
    select: { id: true },
  });
  if (!adminRole) return;

  // Is the target user currently an admin?
  const isCurrentAdmin = await db.cnUserAppRole.findFirst({
    where: { userId, orgId, roleId: adminRole.id },
    select: { id: true },
  });
  if (!isCurrentAdmin) return;

  // Count OTHER admins.
  const otherAdminCount = await db.cnUserAppRole.count({
    where: { orgId, roleId: adminRole.id, userId: { not: userId } },
  });
  if (otherAdminCount === 0) {
    throw new AdminLockoutError(
      "Cannot remove the last administrator. Assign another user to the admin role first.",
      "LAST_ADMIN",
    );
  }
}

/**
 * Refuse to reconcile the admin role's member list to an empty (or
 * effectively empty) set. Called from PUT /api/org/roles/[id]/members.
 *
 * Only fires when `roleId` IS the admin role for this org.
 */
export async function assertReconcileLeavesAdminPopulated(args: {
  orgId: string;
  roleId: string;
  nextUserIds: string[];
}): Promise<void> {
  const { orgId, roleId, nextUserIds } = args;

  const role = await db.cnAppRole.findUnique({
    where: { id: roleId },
    select: { isSystem: true, name: true, orgId: true },
  });
  if (!role || role.orgId !== orgId) return;
  if (!(role.isSystem && role.name === "admin")) return;

  if (nextUserIds.length === 0) {
    throw new AdminLockoutError(
      "Cannot empty the admin role. Keep at least one administrator.",
      "EMPTY_ADMIN_RECONCILE",
    );
  }
}

/**
 * Refuse to delete a system role. Returns the member count so the route can
 * surface "N users will lose access" in a confirm modal.
 *
 * Throws AdminLockoutError("SYSTEM_ROLE_PROTECTED") if the role is system.
 * Returns { memberCount } otherwise — caller decides whether to proceed.
 */
export async function assertRoleDeletable(args: {
  orgId: string;
  roleId: string;
}): Promise<{ memberCount: number }> {
  const { orgId, roleId } = args;

  const role = await db.cnAppRole.findUnique({
    where: { id: roleId },
    select: { isSystem: true, orgId: true },
  });
  if (!role || role.orgId !== orgId) {
    throw new AdminLockoutError("Role not found in this organisation.", "NOT_FOUND");
  }
  if (role.isSystem) {
    throw new AdminLockoutError(
      "System roles cannot be deleted.",
      "SYSTEM_ROLE_PROTECTED",
    );
  }

  const memberCount = await db.cnUserAppRole.count({
    where: { roleId, orgId },
  });
  return { memberCount };
}

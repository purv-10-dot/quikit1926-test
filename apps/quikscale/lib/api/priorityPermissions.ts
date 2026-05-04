import { db } from "@/lib/db";
import { ROLES, ROLE_HIERARCHY } from "@quikit/shared";

const ADMIN_MIN_LEVEL = ROLE_HIERARCHY[ROLES.ADMIN];

/**
 * Returns true when the user is allowed to update or delete the given Priority.
 *
 * Rules (ANY of):
 *   - Creator (`priority.createdBy === userId`)
 *   - Assignee (`priority.owner === userId`)
 *   - Admin-level role on this tenant (role >= admin)
 *   - Super-admin flag on the user
 *
 * Server-only helper. Pairs with the client-side `useCanEditPriority` hook.
 */
export async function canEditPriority(
  userId: string,
  orgId: string,
  priority: { createdBy: string; owner: string },
): Promise<boolean> {
  if (!userId || !orgId || !priority) return false;

  // 1. Creator or assignee
  if (priority.createdBy === userId || priority.owner === userId) return true;

  // 2. Admin role
  const membership = await db.membership.findFirst({
    where: { userId, orgId, status: "active" },
    select: { role: true },
  });
  if (membership) {
    const level = ROLE_HIERARCHY[membership.role] ?? 0;
    if (level >= ADMIN_MIN_LEVEL) return true;
  }

  // 3. Super-admin
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { isSuperAdmin: true },
  });
  return !!user?.isSuperAdmin;
}

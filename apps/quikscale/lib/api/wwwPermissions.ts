import { db } from "@/lib/db";
import { ROLES, ROLE_HIERARCHY } from "@quikit/shared";

const ADMIN_MIN_LEVEL = ROLE_HIERARCHY[ROLES.ADMIN];

/**
 * Returns true when the user is allowed to update or delete the given WWW item.
 *
 * Permission rules (ANY of):
 *   - The user created the item (`createdBy === userId`)
 *   - The user is the assigned owner (`who === userId`)
 *   - The user has an active Membership in the tenant with role >= admin
 *   - The user is super-admin (tracked via SuperAdmin table)
 *
 * Server-only helper. Call before performing any mutation on a WWW item.
 */
export async function canEditWWW(
  userId: string,
  orgId: string,
  item: { createdBy: string; who: string },
): Promise<boolean> {
  if (!userId || !orgId || !item) return false;

  // 1. Creator or assignee
  if (item.createdBy === userId || item.who === userId) return true;

  // 2. Admin-level role via Membership
  const membership = await db.orgMember.findFirst({
    where: { userId, orgId, status: "active" },
    select: { role: true },
  });
  if (membership) {
    const level = ROLE_HIERARCHY[membership.role] ?? 0;
    if (level >= ADMIN_MIN_LEVEL) return true;
  }

  // 3. Super-admin (boolean flag on User)
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { isSuperAdmin: true },
  });
  return !!user?.isSuperAdmin;
}

/**
 * Returns true when the user is allowed to change a WWW item's ASSIGNMENT
 * fields — "Who" (assignee) and "When" (due date).
 *
 * Stricter than {@link canEditWWW}: the assignee is intentionally NOT granted
 * this right. Only the original creator (or an admin / super-admin override)
 * may reassign the item or move its due date. Assignees and other editors keep
 * edit rights on the remaining fields (What / Status / Category / Notes) via
 * `canEditWWW`.
 *
 * Server-only helper. Call before persisting a who/when change.
 */
export async function canEditWWWAssignment(
  userId: string,
  orgId: string,
  item: { createdBy: string },
): Promise<boolean> {
  if (!userId || !orgId || !item) return false;

  // 1. Creator
  if (item.createdBy === userId) return true;

  // 2. Admin-level role via Membership
  const membership = await db.orgMember.findFirst({
    where: { userId, orgId, status: "active" },
    select: { role: true },
  });
  if (membership) {
    const level = ROLE_HIERARCHY[membership.role] ?? 0;
    if (level >= ADMIN_MIN_LEVEL) return true;
  }

  // 3. Super-admin (boolean flag on User)
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { isSuperAdmin: true },
  });
  return !!user?.isSuperAdmin;
}

import { isOrgAdmin } from "@/lib/api/visibility";

/**
 * Returns true when the user is allowed to update or delete the given WWW item.
 *
 * Permission rules (ANY of):
 *   - The user created the item (`createdBy === userId`)
 *   - The user is the assigned owner (`who === userId`)
 *   - The user is an org admin (RBAC v2 system `admin` AppRole, legacy
 *     `OrgMember.role >= admin`, or super-admin — see {@link isOrgAdmin})
 *
 * Admin detection delegates to the shared `isOrgAdmin` helper so it stays
 * consistent with the WWW list route and the rest of the app. The earlier
 * inline legacy-only `OrgMember.role` check missed v2 admins (whose legacy role
 * is often just `member`), so an admin couldn't edit items they didn't own.
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

  // 2. Org admin (v2 AppRole / legacy role / super-admin)
  return isOrgAdmin(userId, orgId);
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

  // 2. Org admin (v2 AppRole / legacy role / super-admin)
  return isOrgAdmin(userId, orgId);
}

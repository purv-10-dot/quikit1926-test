import { db } from "@/lib/db";

/**
 * Soft-delete ("removed from QuikAsset") checks. A marker row in AstUserRemoval
 * hides the user from the merged Users list AND denies QuikAsset access — no
 * User/OrgMember/UserAppAccess/AstUserAppRole/AstEmployee row is ever deleted.
 */

/** True when this user is soft-removed from QuikAsset in the given org. */
export async function isRemovedFromQuikAsset(userId: string, orgId: string): Promise<boolean> {
  const row = await db.astUserRemoval.findUnique({
    where: { orgId_userId: { orgId, userId } },
    select: { id: true },
  });
  return !!row;
}

/** Of the given userIds, the subset soft-removed from QuikAsset in this org. */
export async function removedUserIds(orgId: string, userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows =
    (await db.astUserRemoval.findMany({
      where: { orgId, userId: { in: userIds } },
      select: { userId: true },
    })) ?? [];
  return new Set(rows.map((r) => r.userId));
}

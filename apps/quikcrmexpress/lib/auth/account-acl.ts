/**
 * Account ACL — ported from quikcrm-nextjs/src/lib/auth/account-acl.ts.
 *
 * Model accessors renamed to the new Crm* naming:
 *   userAccountAccess  → crmUserAccountAccess
 *   salesGroupMember   → crmSalesGroupMember
 *   salesGroupManager  → crmSalesGroupManager
 *   salesGroupAccount  → crmSalesGroupAccount
 */
import { db } from "@/lib/db";
import type { SessionUser } from "@/types/permission";

const ADMIN_ROLE = "Administrator";

export type AclScope =
  | { unrestricted: true }
  | { unrestricted: false; allowedAccountIds: string[] };

/**
 * Compute the set of accounts a user can see.
 *
 * - Admin role: unrestricted.
 * - Others: union of (a) QceUserAccountAccess rows + (b) accounts attached
 *   to any sales group the user is a member or manager of.
 * - Backwards-compat: if no ACL rows AND no sales-group membership exists,
 *   returns unrestricted (matches the legacy "no ACL configured = full org access" behavior).
 */
export async function getScope(user: SessionUser): Promise<AclScope> {
  if (user.role === ADMIN_ROLE) return { unrestricted: true };

  const [direct, groupMember, groupManager] = await Promise.all([
    db.qceUserAccountAccess.findMany({
      where: { userId: user.userId },
      select: { accountId: true },
    }),
    db.qceSalesGroupMember.findMany({
      where: { userId: user.userId },
      select: { groupId: true },
    }),
    db.qceSalesGroupManager.findMany({
      where: { userId: user.userId },
      select: { groupId: true },
    }),
  ]);

  const groupIds = [
    ...new Set([
      ...groupMember.map((g) => g.groupId),
      ...groupManager.map((g) => g.groupId),
    ]),
  ];
  const groupAccounts = groupIds.length
    ? await db.qceSalesGroupAccount.findMany({
        where: { groupId: { in: groupIds } },
        select: { accountId: true },
      })
    : [];

  const allowed = [
    ...new Set([
      ...direct.map((d) => d.accountId),
      ...groupAccounts.map((g) => g.accountId),
    ]),
  ];

  // Backwards-compat: empty ACL → unrestricted.
  if (allowed.length === 0 && direct.length === 0 && groupAccounts.length === 0) {
    return { unrestricted: true };
  }
  return { unrestricted: false, allowedAccountIds: allowed };
}

export async function assertAccountAccess(
  user: SessionUser,
  accountId: string | null | undefined,
): Promise<void> {
  if (!accountId) return;
  const scope = await getScope(user);
  if (scope.unrestricted) return;
  if (!scope.allowedAccountIds.includes(accountId)) {
    const err = new Error(`Forbidden: account ${accountId} not in scope`) as Error & {
      statusCode?: number;
    };
    err.statusCode = 403;
    throw err;
  }
}

/**
 * Returns a Prisma `where` fragment restricting `accountId` to the user's scope.
 * Use AND-merged with module-specific filters on leads/contacts/opportunities.
 * Returns null when the user is unrestricted (caller should skip the AND).
 */
export async function accountScopeFilter(
  user: SessionUser,
): Promise<Record<string, unknown> | null> {
  const scope = await getScope(user);
  if (scope.unrestricted) return null;
  return {
    OR: [
      { accountId: { in: scope.allowedAccountIds } },
      { accountId: null },
    ],
  };
}

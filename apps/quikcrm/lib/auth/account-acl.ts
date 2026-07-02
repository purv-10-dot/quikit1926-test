/**
 * Account ACL — computes the set of CrmAccount IDs a user can see.
 *
 * Role → scope mapping
 * ────────────────────
 * Administrator  : unrestricted (all accounts in the org)
 * Any role that manages teams via CrmTeamManager:
 *                  union of team-scope accounts (from resolveTeamScope)
 *                  PLUS their own role-based accounts below
 * SalesManager   : accounts in the CrmSalesGroups they manage
 *                  (via CrmSalesGroupManager) + direct CrmUserAccountAccess
 * SalesUser /
 * MarketingUser /
 * FinanceUser    : union of CrmUserAccountAccess rows + accounts of
 *                  groups the user is a member/manager of
 *
 * Key invariant: OrgMember.role and the CrmTeamManager table are INDEPENDENT.
 * A user with role "SalesManager" may also be in CrmTeamManager. getScope()
 * always resolves team scope for every non-admin user and merges the result
 * with their role-specific account list.
 *
 * Lead visibility:
 *   - Accounts in allowedAccountIds: always visible
 *   - Unattached leads (accountId = null): always visible to their own owner
 *   - Leads owned by team members (teamMemberIds): visible to team managers,
 *     regardless of which account the lead is attached to
 *
 * REQUIRES MIGRATION: docs/migrations/20260610_enterprise_team_hierarchy.sql
 *   for CrmTeamManager table and CrmSalesGroup.teamId column.
 */
import { prisma } from "@/lib/db/prisma";
import { resolveTeamScope } from "@/lib/services/teams/team-scope";
import type { SessionUser } from "@/types/permission";

const ADMIN_ROLES = new Set(["Administrator"]);

export type AclScope =
  | { unrestricted: true }
  | { unrestricted: false; allowedAccountIds: string[]; teamMemberIds: string[] };

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Resolve account IDs for a SalesManager:
 *   CrmSalesGroupManager → CrmSalesGroupAccount
 */
async function salesManagerAccountIds(user: SessionUser): Promise<string[]> {
  const managedGroups = await prisma.crmSalesGroupManager.findMany({
    where: { userId: user.userId },
    select: { groupId: true, group: { select: { orgId: true } } },
  });

  const groupIds = managedGroups
    .filter((g) => g.group.orgId === user.orgId)
    .map((g) => g.groupId);
  if (groupIds.length === 0) return [];

  const accounts = await prisma.crmSalesGroupAccount.findMany({
    where: { groupId: { in: groupIds } },
    select: { accountId: true },
  });

  return [...new Set(accounts.map((a) => a.accountId))];
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute the set of accounts a user can see.
 *
 * Always resolves team scope via resolveTeamScope (checks CrmTeamManager
 * directly, not OrgMember.role) so that any role can act as a team manager.
 * Team-scope accounts are merged with role-specific accounts.
 *
 * Returns { unrestricted: true } for Administrators.
 * Returns { unrestricted: false, allowedAccountIds, teamMemberIds } for all others.
 */
export async function getScope(user: SessionUser): Promise<AclScope> {
  if (ADMIN_ROLES.has(user.role)) return { unrestricted: true };

  // Always resolve team scope in parallel with role-specific lookup.
  // resolveTeamScope checks the CrmTeamManager table directly — any role
  // (SalesManager, SalesUser, etc.) can be a team manager.
  let roleAccountsPromise: Promise<string[]>;

  if (user.role === "SalesManager") {
    roleAccountsPromise = (async () => {
      const [managerAccounts, direct] = await Promise.all([
        salesManagerAccountIds(user),
        prisma.crmUserAccountAccess.findMany({
          where: { userId: user.userId },
          select: { accountId: true },
        }),
      ]);
      return [...new Set([...managerAccounts, ...direct.map((d) => d.accountId)])];
    })();
  } else {
    // SalesUser / MarketingUser / FinanceUser / TeamManager (pure) / unknown roles
    roleAccountsPromise = (async () => {
      const [direct, groupMember, groupManager] = await Promise.all([
        prisma.crmUserAccountAccess.findMany({
          where: { userId: user.userId },
          select: { accountId: true },
        }),
        prisma.crmSalesGroupMember.findMany({
          where: { userId: user.userId },
          select: { groupId: true },
        }),
        prisma.crmSalesGroupManager.findMany({
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
        ? await prisma.crmSalesGroupAccount.findMany({
            where: { groupId: { in: groupIds } },
            select: { accountId: true },
          })
        : [];

      return [
        ...new Set([
          ...direct.map((d) => d.accountId),
          ...groupAccounts.map((g) => g.accountId),
        ]),
      ];
    })();
  }

  const [teamScope, roleAccounts] = await Promise.all([
    resolveTeamScope(user),
    roleAccountsPromise,
  ]);

  const teamAccountIds = teamScope?.accountIds ?? [];
  const teamMemberIds = teamScope?.memberIds ?? [];

  const allowedAccountIds = [...new Set([...teamAccountIds, ...roleAccounts])];

  // console.log(
  //   `[acl-scope] user=${user.email} role=${user.role} ` +
  //     `allowedAccountIds(${allowedAccountIds.length})=${JSON.stringify(allowedAccountIds)} ` +
  //     `teamMemberIds(${teamMemberIds.length})=${JSON.stringify(teamMemberIds)}`,
  // );

  return { unrestricted: false, allowedAccountIds, teamMemberIds };
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
 * Returns a Prisma `where` fragment restricting lead visibility to the user's scope.
 * AND-merge this with module-specific filters on leads/contacts/opportunities.
 * Returns null when the user is unrestricted (caller should skip the AND).
 *
 * OR clauses:
 *   1. accountId in allowedAccountIds      — account-linked leads in scope
 *   2. ownerId = self                      — own leads always visible, attached
 *      or not. Covers leads auto-attached to a new account during conversion:
 *      lead conversion creates/links a CrmAccount the owner has no explicit
 *      access to, so an `accountId = null` clause would hide a user's own
 *      converted leads (the "Show Converted Leads" bug). Owning a lead is
 *      itself sufficient grounds to see it; this never exposes another user's
 *      lead because it keys on the viewer's own userId.
 *   3. ownerId in teamMemberIds            — any lead owned by a team member
 *      (only added when the user manages a team; covers attached + unattached)
 */
export async function accountScopeFilter(
  user: SessionUser,
): Promise<Record<string, unknown> | null> {
  const scope = await getScope(user);
  if (scope.unrestricted) return null;

  const orClauses: Record<string, unknown>[] = [
    { accountId: { in: scope.allowedAccountIds } },
    // Own leads are always visible to their owner — attached or not. (Broadened
    // from the prior `accountId: null AND ownerId = self` so conversion, which
    // auto-attaches the lead to a fresh out-of-scope account, can't hide a
    // user's own converted leads.)
    { ownerId: user.userId },
  ];

  // Team managers see every lead owned by their team members, regardless of
  // whether the lead is attached to an account (and regardless of which account).
  if (scope.teamMemberIds.length > 0) {
    orClauses.push({ ownerId: { in: scope.teamMemberIds } });
  }

  const filter = { OR: orClauses };

  // console.log(
  //   `[acl-filter] user=${user.email} role=${user.role} ` +
  //     `finalLeadFilter=${JSON.stringify(filter)}`,
  // );

  return filter;
}

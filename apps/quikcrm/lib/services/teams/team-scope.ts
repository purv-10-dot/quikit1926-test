/**
 * TeamManager scope resolution.
 *
 * Hierarchy:
 *   CrmSalesTeam  (management layer — reporting, forecasting)
 *     └── CrmSalesGroup (ACL layer — record visibility)
 *           └── User → CrmAccount → CrmLead / Opp / …
 *
 * TeamManager permission model:
 *   • Dashboard : team-level aggregation across all managed groups
 *   • ACL scope : union of all accounts in all groups of managed teams
 *   • Assignment : any active member across all groups in managed teams
 *   • Cannot promote another TeamManager or Administrator
 *
 * REQUIRES MIGRATION: docs/migrations/20260610_enterprise_team_hierarchy.sql
 *   (creates CrmTeamMember, CrmTeamManager, adds CrmSalesGroup.teamId)
 *
 * Uses $queryRaw for the new tables because they are not yet in the
 * Prisma schema file (packages/database/prisma/schema.prisma is owned
 * by the integration team). Once the schema is updated, switch these to
 * type-safe Prisma calls.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { db } from "@/lib/db";
import type { SessionUser } from "@/types/permission";

export interface TeamScopeResult {
  teamIds: string[];
  groupIds: string[];
  /** User IDs of all members across all groups in managed teams */
  memberIds: string[];
  /** Account IDs visible to the TeamManager via group ACL */
  accountIds: string[];
  size: number;
}

interface RawRow {
  id?: string;
  teamId?: string;
  groupId?: string;
  userId?: string;
  accountId?: string;
}

/**
 * Returns the full team scope for any user who manages a team via CrmTeamManager.
 *
 * Previously gated on `user.role === "TeamManager"`, which broke resolution for
 * users whose OrgMember.role is "SalesManager" but who are nonetheless in the
 * CrmTeamManager table. Now checks the table directly so any role can act as a
 * team manager — the org-level role and the CRM team-manager relationship are
 * independent.
 *
 * Returns null when the user manages no teams (zero CrmTeamManager rows).
 *
 * memberIds sources (union, deduplicated):
 *   1. CrmTeamMember     — direct team membership rows
 *   2. CrmSalesGroupMember — members of linked sales groups
 *   3. CrmSalesGroupManager — co-managers of linked sales groups
 *   4. The managing user themselves
 */
export async function resolveTeamScope(user: SessionUser): Promise<TeamScopeResult | null> {
  // 1. Teams where this user is listed as a manager (new table + legacy fallback)
  const [managerRows, legacyRows] = await Promise.all([
    prisma
      .$queryRaw<RawRow[]>(
        Prisma.sql`
          SELECT "teamId"
          FROM   app_quikcrm."CrmTeamManager"
          WHERE  "userId" = ${user.userId}
        `,
      )
      .catch(() => [] as RawRow[]),
    prisma.crmSalesTeam.findMany({
      where: { orgId: user.orgId, managerId: user.userId },
      select: { id: true },
    }),
  ]);

  const teamIds = [
    ...new Set([
      ...managerRows.map((r) => r.teamId as string),
      ...legacyRows.map((t) => t.id),
    ]),
  ];

  // console.log(
  //   `[team-scope] user=${user.email} (${user.userId}) role=${user.role} ` +
  //     `resolvedTeamIds=${JSON.stringify(teamIds)}`,
  // );

  if (teamIds.length === 0) {
    // console.log(`[team-scope] user=${user.email} — no managed teams, scope=null`);
    return null;
  }

  // 2. Sales groups linked to those teams + direct CrmTeamMember rows (parallel)
  const [groupRows, directMemberRows] = await Promise.all([
    prisma
      .$queryRaw<RawRow[]>(
        Prisma.sql`
          SELECT "id"
          FROM   app_quikcrm."CrmSalesGroup"
          WHERE  "teamId" = ANY(${teamIds}::text[])
            AND  "orgId"  = ${user.orgId}
        `,
      )
      .catch(() => [] as RawRow[]),
    // Direct team members — captured even when the team has no linked sales groups
    prisma
      .$queryRaw<RawRow[]>(
        Prisma.sql`
          SELECT "userId"
          FROM   app_quikcrm."CrmTeamMember"
          WHERE  "teamId" = ANY(${teamIds}::text[])
        `,
      )
      .catch(() => [] as RawRow[]),
  ]);

  const groupIds = groupRows.map((r) => r.id as string);

  // console.log(
  //   `[team-scope] user=${user.email} ` +
  //     `resolvedGroupIds=${JSON.stringify(groupIds)} ` +
  //     `directMemberIds=${JSON.stringify(directMemberRows.map((r) => r.userId))}`,
  // );

  // 3. Group members, co-managers, and accounts (only when groups exist)
  const [memberRows, coManagerRows, accountRows] = groupIds.length
    ? await Promise.all([
        prisma.crmSalesGroupMember.findMany({
          where: { groupId: { in: groupIds } },
          select: { userId: true },
        }),
        prisma.crmSalesGroupManager.findMany({
          where: { groupId: { in: groupIds } },
          select: { userId: true },
        }),
        prisma.crmSalesGroupAccount.findMany({
          where: { groupId: { in: groupIds } },
          select: { accountId: true },
        }),
      ])
    : [
        [] as { userId: string }[],
        [] as { userId: string }[],
        [] as { accountId: string }[],
      ];

  // Merge all member sources
  const memberIds = [
    ...new Set([
      user.userId,
      ...directMemberRows.map((r) => r.userId as string),
      ...memberRows.map((r) => r.userId),
      ...coManagerRows.map((r) => r.userId),
    ]),
  ];

  const accountIds = [...new Set(accountRows.map((r) => r.accountId))];

  // console.log(
  //   `[team-scope] user=${user.email} ` +
  //     `resolvedMemberIds=${JSON.stringify(memberIds)} ` +
  //     `resolvedAccountIds=${JSON.stringify(accountIds)}`,
  // );

  return { teamIds, groupIds, memberIds, accountIds, size: memberIds.length };
}

/**
 * Returns display-name strings for all members in the team scope.
 * Used by the dashboard to populate "Team Members" cards.
 */
export async function resolveTeamScopeWithNames(
  user: SessionUser,
): Promise<(TeamScopeResult & { memberNames: string[] }) | null> {
  const scope = await resolveTeamScope(user);
  if (!scope) return null;

  if (scope.memberIds.length === 0) {
    return { ...scope, memberNames: [] };
  }

  const users = await db.user.findMany({
    where: { id: { in: scope.memberIds } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });

  const memberNames = users
    .map((u) => `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email)
    .filter(Boolean);

  return { ...scope, memberNames };
}

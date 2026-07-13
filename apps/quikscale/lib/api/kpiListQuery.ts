/**
 * Shared KPI list scoping — builds the Prisma `where` for the KPI list
 * (orgId tenant filter + trash toggle + column filters + row-level
 * visibility), EXCLUDING free-text search and ordering.
 *
 * Extracted from `GET /api/kpi` so the KPI export route reuses the exact same
 * tenant-isolation + visibility rules. Any divergence here would let an export
 * leak rows the list view hides, so both paths call this single function.
 */
import { Prisma } from "@quikit/database";
import { db } from "@/lib/db";
import { isOrgAdmin, getMyTeamIds } from "@/lib/api/visibility";

export interface KpiScopeParams {
  status?: string;
  kpiLevel?: string;
  owner?: string;
  teamId?: string;
  /** Team KPI multi-select (`teamIds=a,b,c`). */
  teamIds?: string[];
  parentKPIId?: string;
  quarter?: string;
  year?: number;
  /** Trash toggle — true returns ONLY soft-deleted rows. */
  includeDeleted?: boolean;
  /** Dashboard "My Dashboard" personal scope. */
  scopeMine?: boolean;
}

export async function buildKpiScopeWhere(
  ctx: { orgId: string; userId: string },
  params: KpiScopeParams,
): Promise<Prisma.KPIWhereInput> {
  const { orgId, userId } = ctx;
  const teamIdList = params.teamIds ?? [];

  // Typed so the `orgId` tenant filter can't be silently dropped by a future edit.
  const where: Prisma.KPIWhereInput = { orgId };
  // Trash toggle: by default return only active (not soft-deleted). When
  // includeDeleted, return ONLY soft-deleted records for the trash view.
  where.deletedAt = params.includeDeleted ? { not: null } : null;
  if (params.status) where.status = params.status;
  if (params.kpiLevel) where.kpiLevel = params.kpiLevel;
  // Owner filter semantics depend on level: individual KPIs carry a single
  // `owner` scalar; team KPIs carry an `ownerIds[]` co-owner list.
  if (params.owner) {
    if (params.kpiLevel === "team") where.ownerIds = { has: params.owner };
    else where.owner = params.owner;
  }
  // Team filter semantics depend on kpiLevel (see GET /api/kpi for the full
  // rationale): team KPIs filter on KPI.teamId; individual KPIs resolve the
  // team's active members and filter KPI.owner IN (...).
  if (params.kpiLevel === "team" && teamIdList.length > 0) {
    where.teamId = teamIdList.length === 1 ? teamIdList[0] : { in: teamIdList };
  } else if (params.teamId) {
    if (params.kpiLevel === "individual") {
      const members = await db.orgMember.findMany({
        where: { orgId, teamId: params.teamId, status: "active" },
        select: { userId: true },
      });
      const memberIds = members.map((m) => m.userId);
      where.owner = memberIds.length > 0 ? { in: memberIds } : "__no_team_members__";
    } else if (params.kpiLevel === "team") {
      where.teamId = params.teamId;
    } else {
      const members = await db.orgMember.findMany({
        where: { orgId, teamId: params.teamId, status: "active" },
        select: { userId: true },
      });
      const memberIds = members.map((m) => m.userId);
      where.OR = [
        { teamId: params.teamId },
        ...(memberIds.length > 0 ? [{ owner: { in: memberIds } }] : []),
      ];
    }
  }
  if (params.parentKPIId) where.parentKPIId = params.parentKPIId;
  if (params.quarter) where.quarter = params.quarter;
  if (params.year) where.year = params.year;

  // ── Row-level visibility ────────────────────────────────────────────────
  // Dashboard personal scope overrides admin/non-admin visibility (an admin
  // viewing "My Dashboard" still only sees their own rows).
  if (params.scopeMine) {
    where.OR = [
      { kpiLevel: "individual", owner: userId },
      { kpiLevel: "team", ownerIds: { has: userId } },
    ];
  }

  const adminBypass = await isOrgAdmin(userId, orgId);
  if (!adminBypass && !params.scopeMine) {
    if (params.kpiLevel === "individual") {
      where.owner = userId;
    } else if (params.kpiLevel === "team") {
      const myTeams = await getMyTeamIds(userId, orgId);
      where.teamId = myTeams.length > 0 ? { in: myTeams } : "__no_team_membership__";
    } else {
      const myTeams = await getMyTeamIds(userId, orgId);
      const ownerOr: Prisma.KPIWhereInput[] = [{ owner: userId }];
      if (myTeams.length > 0) ownerOr.push({ teamId: { in: myTeams } });
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: ownerOr }];
        delete where.OR;
      } else {
        where.OR = ownerOr;
      }
    }
  }

  return where;
}

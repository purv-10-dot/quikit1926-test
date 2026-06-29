/**
 * Role-aware dashboard metric queries.
 *
 * Every function reuses the same ACL helpers as the module API routes
 * so dashboard counts always match module counts:
 *
 *   accountScopeFilter(user)      → same filter as /api/leads, /api/contacts,
 *                                   /api/opportunities (account-based ACL)
 *   getScope(user)                → base scope for quotes (required accountId)
 *   resolveTeamScope(user)        → team-level scope for TeamManager
 *   resolveManagerTeam(user)      → group-level team for SalesManager activities/tasks
 *
 * No query here bypasses the existing role/ACL model.
 *
 * Role → dashboard content:
 *   Administrator  : org-wide — all leads, accounts, contacts, opps, quotes, activities
 *   TeamManager    : team-wide — all records across all groups in managed teams
 *   SalesManager   : group-wide — all records in managed sales groups
 *   SalesUser      : personal — own records only
 *   MarketingUser  : campaigns + lead sources (ACL-scoped)
 *   FinanceUser    : revenue / forecasts / quotes (ACL-scoped)
 */

import type { CrmOpportunityStage } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/types/permission";
import { accountScopeFilter, getScope } from "@/lib/auth/account-acl";
import { resolveManagerTeam } from "./team";
import { resolveTeamScope } from "@/lib/services/teams/team-scope";
import { formatINR } from "./currency";
import type {
  ActivityTypeCount,
  ActivityByRep,
  AdminMetrics,
  TeamManagerMetrics,
  SalesManagerMetrics,
  SalesUserMetrics,
  MarketingMetrics,
  FinanceMetrics,
  RoleMetricsDto,
} from "@/lib/dashboard/role-metrics-types";

const CLOSED_WON: CrmOpportunityStage = "ClosedWon";
const CLOSED_STAGES: CrmOpportunityStage[] = ["ClosedWon", "ClosedLost"];

/**
 * Optional reporting window. PARTIAL-WINDOWING CONTRACT: a range passed to
 * buildRoleMetrics windows ACTIVITY fields ONLY (totalActivities/teamActivities/
 * myActivities counts, activitiesByType, activityByRep). Leads, opportunities,
 * tasks, and quotes remain ALL-TIME regardless of range. A future caller (e.g.
 * the dashboard) must NOT assume the whole DTO windows — only activity fields do.
 */
export type MetricsRange = { from: Date; to: Date };

// KEYSTONE: the date filter as a SPREAD FRAGMENT. Omitted range → {} → the
// activity `where` is BYTE-IDENTICAL to the pre-window behavior (NO occurredAt
// key), which is what keeps FR-4.1 / FR-4.2 green untouched. Passed → an
// ADDITIONAL occurredAt bound merged onto the existing tier scope (never replaces
// scope).
function dateWhere(range?: MetricsRange): Record<string, unknown> {
  return range ? { occurredAt: { gte: range.from, lt: range.to } } : {};
}

// Per-rep TRUE activity volume (count per ownerId), within the SAME tier scope
// where (single-sourced — does NOT re-derive scope) + the optional window.
// ownerName from the denormalized CrmActivity.ownerName.
async function activityByRepFor(
  where: Record<string, unknown>,
): Promise<ActivityByRep[]> {
  const rows = await prisma.crmActivity.groupBy({
    by: ["ownerId", "ownerName"],
    where: where as never,
    _count: { _all: true },
  });
  return rows
    .filter((r) => r.ownerId != null)
    .map((r) => ({ ownerId: r.ownerId as string, ownerName: r.ownerName ?? null, count: r._count._all }));
}

// FR-4.2: activity counts grouped by type LABEL (CrmActivity.type), within the
// caller's already-computed scope where-clause. Reuses the SAME `where` the
// tier's crmActivity.count uses — does NOT re-derive scope (FR-4.1 pins that
// contract). Grouped by label, not a stable id (no activityTypeId column —
// see ACTIVITY-FEATURE-DECISIONS.md 2026-06-24).
async function activitiesByTypeFor(
  where: Record<string, unknown>,
): Promise<ActivityTypeCount[]> {
  const rows = await prisma.crmActivity.groupBy({
    by: ["type"],
    where: where as never,
    _count: { _all: true },
  });
  return rows.map((r) => ({ type: r.type, count: r._count._all }));
}

// ─── Administrator ────────────────────────────────────────────────────────────
// accountScopeFilter returns null for Administrator, matching /api/leads.

async function buildAdminMetrics(user: SessionUser, range?: MetricsRange): Promise<AdminMetrics> {
  const { orgId } = user;

  // Activity scope where + optional window. Non-activity counts stay all-time.
  const activityWhere = { orgId, ...dateWhere(range) };

  const [
    totalLeads,
    totalAccounts,
    totalContacts,
    totalOpportunities,
    wonAgg,
    totalActivities,
    totalTasks,
    totalQuotes,
    activitiesByType,
    activityByRep,
  ] = await Promise.all([
    prisma.crmLead.count({ where: { orgId, deletedAt: null } }),
    prisma.crmAccount.count({ where: { orgId, deletedAt: null } }),
    prisma.crmContact.count({ where: { orgId, deletedAt: null } }),
    prisma.crmOpportunity.count({ where: { orgId, deletedAt: null } }),
    prisma.crmOpportunity.aggregate({
      where: { orgId, stage: CLOSED_WON, deletedAt: null },
      _sum: { amount: true },
    }),
    prisma.crmActivity.count({ where: activityWhere }),
    prisma.crmTask.count({ where: { orgId } }),
    prisma.crmQuote.count({ where: { orgId, deletedAt: null } }),
    activitiesByTypeFor(activityWhere), // FR-4.2: same { orgId } scope (+ window) as the count
    activityByRepFor(activityWhere), // §1: per-rep volume, same scope + window
  ]);

  const totalRevenue = Number(wonAgg._sum?.amount ?? 0);
  return {
    totalLeads,
    totalAccounts,
    totalContacts,
    totalOpportunities,
    totalRevenue,
    totalRevenueDisplay: formatINR(totalRevenue),
    totalActivities,
    totalTasks,
    totalQuotes,
    activitiesByType,
    activityByRep,
  };
}

// ─── TeamManager ──────────────────────────────────────────────────────────────
// Team-level aggregation: all groups in managed teams → accounts → records.
//
// Leads / Opps / Quotes : accountScopeFilter (same ACL as /api/leads)
// Activities / Tasks    : resolveTeamScope memberIds (no accountId on those models)
//
// When the migration has not yet been applied (teamId column missing on
// CrmSalesGroup), resolveTeamScope returns scope with empty arrays and
// the dashboard gracefully shows zeros rather than crashing.

async function buildTeamManagerMetrics(user: SessionUser): Promise<TeamManagerMetrics> {
  const { orgId } = user;

  const [aclFilter, scope, teamScope] = await Promise.all([
    accountScopeFilter(user),
    getScope(user),
    resolveTeamScope(user),
  ]);

  const memberIds = teamScope?.memberIds ?? [];
  const teamMemberCount = memberIds.length;
  const teamCount = teamScope?.teamIds.length ?? 0;
  const groupCount = teamScope?.groupIds.length ?? 0;

  const baseWhere = { orgId, deletedAt: null };
  const leadWhere = aclFilter ? { AND: [baseWhere, aclFilter] } : baseWhere;
  const oppWhere = aclFilter ? { AND: [baseWhere, aclFilter] } : baseWhere;
  const openOppBase = { orgId, deletedAt: null, stage: { notIn: CLOSED_STAGES } };
  const openOppWhere = aclFilter ? { AND: [openOppBase, aclFilter] } : openOppBase;
  const wonOppBase = { orgId, deletedAt: null, stage: CLOSED_WON };
  const wonOppWhere = aclFilter ? { AND: [wonOppBase, aclFilter] } : wonOppBase;

  const quoteWhere = scope.unrestricted
    ? { orgId, deletedAt: null }
    : { orgId, deletedAt: null, accountId: { in: scope.allowedAccountIds } };

  const activityWhere =
    memberIds.length > 0
      ? { orgId, ownerId: { in: memberIds } }
      : { orgId, ownerId: user.userId };
  const taskWhere =
    memberIds.length > 0
      ? { orgId, assignedToUserId: { in: memberIds } }
      : { orgId, assignedToUserId: user.userId };

  const [
    teamLeads,
    teamOpportunities,
    wonAgg,
    openOppRows,
    teamActivities,
    teamTasks,
    teamQuotes,
  ] = await Promise.all([
    prisma.crmLead.count({ where: leadWhere }),
    prisma.crmOpportunity.count({ where: oppWhere }),
    prisma.crmOpportunity.aggregate({ where: wonOppWhere, _sum: { amount: true } }),
    prisma.crmOpportunity.findMany({ where: openOppWhere, select: { amount: true } }),
    prisma.crmActivity.count({ where: activityWhere }),
    prisma.crmTask.count({ where: taskWhere }),
    prisma.crmQuote.count({ where: quoteWhere }),
  ]);

  const teamRevenue = Number(wonAgg._sum?.amount ?? 0);
  const teamPipeline = openOppRows.reduce((s, r) => s + Number(r.amount ?? 0), 0);

  return {
    teamCount,
    groupCount,
    teamMemberCount,
    teamLeads,
    teamOpportunities,
    teamRevenue,
    teamRevenueDisplay: formatINR(teamRevenue),
    teamPipeline,
    teamPipelineDisplay: formatINR(teamPipeline),
    teamActivities,
    teamTasks,
    teamQuotes,
  };
}

// ─── SalesManager ────────────────────────────────────────────────────────────
// Account scope from managed sales groups + team member IDs.

async function buildSalesManagerMetrics(user: SessionUser, range?: MetricsRange): Promise<SalesManagerMetrics> {
  const { orgId } = user;

  const aclFilter = await accountScopeFilter(user);
  const scope = await getScope(user);
  const team = await resolveManagerTeam(user);

  const memberIds = team?.memberIds ?? [];
  const teamMemberCount = team?.size ?? 0;

  const baseWhere = { orgId, deletedAt: null };
  const leadWhere = aclFilter ? { AND: [baseWhere, aclFilter] } : baseWhere;
  const oppWhere = aclFilter ? { AND: [baseWhere, aclFilter] } : baseWhere;
  const openOppBase = { orgId, deletedAt: null, stage: { notIn: CLOSED_STAGES } };
  const openOppWhere = aclFilter ? { AND: [openOppBase, aclFilter] } : openOppBase;
  const wonOppBase = { orgId, deletedAt: null, stage: CLOSED_WON };
  const wonOppWhere = aclFilter ? { AND: [wonOppBase, aclFilter] } : wonOppBase;

  const quoteWhere = scope.unrestricted
    ? { orgId, deletedAt: null }
    : { orgId, deletedAt: null, accountId: { in: scope.allowedAccountIds } };

  const activityScope =
    memberIds.length > 0
      ? { orgId, ownerId: { in: memberIds } }
      : { orgId, ownerId: user.userId };
  // Activity scope + optional window (the by-type and by-rep slices reuse it).
  const activityWhere = { ...activityScope, ...dateWhere(range) };
  const taskWhere =
    memberIds.length > 0
      ? { orgId, assignedToUserId: { in: memberIds } }
      : { orgId, assignedToUserId: user.userId };

  const [
    teamLeads,
    teamOpportunities,
    wonAgg,
    openOppRows,
    teamActivities,
    teamTasks,
    teamQuotes,
    activitiesByType,
    activityByRep,
  ] = await Promise.all([
    prisma.crmLead.count({ where: leadWhere }),
    prisma.crmOpportunity.count({ where: oppWhere }),
    prisma.crmOpportunity.aggregate({ where: wonOppWhere, _sum: { amount: true } }),
    prisma.crmOpportunity.findMany({ where: openOppWhere, select: { amount: true } }),
    prisma.crmActivity.count({ where: activityWhere }),
    prisma.crmTask.count({ where: taskWhere }),
    prisma.crmQuote.count({ where: quoteWhere }),
    activitiesByTypeFor(activityWhere), // FR-4.2: reuse the SAME person-scoped where (+ window)
    activityByRepFor(activityWhere), // §1: per-rep volume, same scope + window
  ]);

  const teamRevenue = Number(wonAgg._sum?.amount ?? 0);
  const teamPipeline = openOppRows.reduce((s, r) => s + Number(r.amount ?? 0), 0);

  return {
    teamLeads,
    teamOpportunities,
    teamRevenue,
    teamRevenueDisplay: formatINR(teamRevenue),
    teamActivities,
    teamTasks,
    teamQuotes,
    teamPipeline,
    teamPipelineDisplay: formatINR(teamPipeline),
    teamMemberCount,
    activitiesByType,
    activityByRep,
  };
}

// ─── SalesUser ────────────────────────────────────────────────────────────────
// Own records only (ownerId = user.userId) with accountScopeFilter on top.

async function buildSalesUserMetrics(user: SessionUser, range?: MetricsRange): Promise<SalesUserMetrics> {
  const { orgId, userId } = user;

  const aclFilter = await accountScopeFilter(user);

  const ownedBase = { orgId, ownerId: userId, deletedAt: null };
  const leadWhere = aclFilter ? { AND: [ownedBase, aclFilter] } : ownedBase;
  const oppWhere = aclFilter ? { AND: [ownedBase, aclFilter] } : ownedBase;
  const wonOppBase = { orgId, ownerId: userId, stage: CLOSED_WON, deletedAt: null };
  const wonOppWhere = aclFilter ? { AND: [wonOppBase, aclFilter] } : wonOppBase;

  // Own-activity scope + optional window (by-type and by-rep reuse it).
  const activityWhere = { orgId, ownerId: userId, ...dateWhere(range) };

  const [myLeads, myOpportunities, wonAgg, myActivities, myTasks, myQuotes, activitiesByType, activityByRep] =
    await Promise.all([
      prisma.crmLead.count({ where: leadWhere }),
      prisma.crmOpportunity.count({ where: oppWhere }),
      prisma.crmOpportunity.aggregate({ where: wonOppWhere, _sum: { amount: true } }),
      prisma.crmActivity.count({ where: activityWhere }),
      prisma.crmTask.count({ where: { orgId, assignedToUserId: userId } }),
      prisma.crmQuote.count({ where: { orgId, ownerId: userId, deletedAt: null } }),
      activitiesByTypeFor(activityWhere), // FR-4.2: same own scope (+ window) as the count
      activityByRepFor(activityWhere), // §1: per-rep volume (own — degenerate one row), same scope + window
    ]);

  const myRevenue = Number(wonAgg._sum?.amount ?? 0);
  return {
    myLeads,
    myOpportunities,
    myRevenue,
    myRevenueDisplay: formatINR(myRevenue),
    myActivities,
    myTasks,
    myQuotes,
    activitiesByType,
    activityByRep,
  };
}

// ─── MarketingUser ────────────────────────────────────────────────────────────
// ACL-scoped campaigns + lead source data. No revenue or sales metrics.

async function buildMarketingMetrics(user: SessionUser): Promise<MarketingMetrics> {
  const { orgId } = user;

  const aclFilter = await accountScopeFilter(user);
  const leadBase = { orgId, deletedAt: null };
  const leadWhere = aclFilter ? { AND: [leadBase, aclFilter] } : leadBase;

  const [totalCampaigns, activeCampaigns, totalLeads, qualifiedLeads, sourceGroups] =
    await Promise.all([
      prisma.crmCampaign.count({ where: { orgId } }),
      prisma.crmCampaign.count({ where: { orgId, status: "Active" } }),
      prisma.crmLead.count({ where: leadWhere }),
      prisma.crmLead.count({
        where: aclFilter
          ? { AND: [{ orgId, deletedAt: null, stage: { in: ["Qualified", "SQL"] } }, aclFilter] }
          : { orgId, deletedAt: null, stage: { in: ["Qualified", "SQL"] } },
      }),
      prisma.crmLead.groupBy({
        by: ["source"],
        where: leadWhere,
        _count: { _all: true },
        orderBy: { _count: { source: "desc" } },
        take: 10,
      }),
    ]);

  const leadSources = sourceGroups
    .filter((r) => r.source)
    .map((r) => ({ source: r.source as string, count: r._count._all }));

  const conversionRate =
    totalLeads > 0 ? Math.round((qualifiedLeads / totalLeads) * 100) : null;

  return {
    totalCampaigns,
    activeCampaigns,
    marketingLeads: totalLeads,
    leadSources,
    conversionRate,
  };
}

// ─── FinanceUser ──────────────────────────────────────────────────────────────
// ACL-scoped revenue, pipeline, and quote data.

async function buildFinanceMetrics(user: SessionUser): Promise<FinanceMetrics> {
  const { orgId } = user;

  const [aclFilter, scope] = await Promise.all([
    accountScopeFilter(user),
    getScope(user),
  ]);

  const wonOppBase = { orgId, stage: CLOSED_WON, deletedAt: null };
  const wonOppWhere = aclFilter ? { AND: [wonOppBase, aclFilter] } : wonOppBase;
  const openOppBase = { orgId, deletedAt: null, stage: { notIn: CLOSED_STAGES } };
  const openOppWhere = aclFilter ? { AND: [openOppBase, aclFilter] } : openOppBase;
  const quoteWhere = scope.unrestricted
    ? { orgId, deletedAt: null }
    : { orgId, deletedAt: null, accountId: { in: scope.allowedAccountIds } };

  const [wonAgg, openOpps, totalQuotes, wonDeals] = await Promise.all([
    prisma.crmOpportunity.aggregate({ where: wonOppWhere, _sum: { amount: true } }),
    prisma.crmOpportunity.findMany({
      where: openOppWhere,
      select: { amount: true, probability: true },
    }),
    prisma.crmQuote.count({ where: quoteWhere }),
    prisma.crmOpportunity.count({ where: wonOppWhere }),
  ]);

  const totalRevenue = Number(wonAgg._sum?.amount ?? 0);
  const forecastRevenue = openOpps.reduce(
    (s, o) => s + Number(o.amount ?? 0) * ((o.probability ?? 10) / 100),
    0,
  );

  return {
    totalRevenue,
    totalRevenueDisplay: formatINR(totalRevenue),
    forecastRevenue,
    forecastRevenueDisplay: formatINR(forecastRevenue),
    totalOpportunities: openOpps.length,
    totalQuotes,
    wonDeals,
  };
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export async function buildRoleMetrics(
  user: SessionUser,
  range?: MetricsRange,
): Promise<RoleMetricsDto> {
  switch (user.role) {
    case "Administrator":
      return { role: "Administrator", metrics: await buildAdminMetrics(user, range) };
    case "TeamManager":
      // TeamManager DTO has no activity-window/by-rep fields (not a digest
      // recipient role); range is intentionally not threaded here.
      return { role: "TeamManager", metrics: await buildTeamManagerMetrics(user) };
    case "SalesManager":
      return { role: "SalesManager", metrics: await buildSalesManagerMetrics(user, range) };
    case "MarketingUser":
      return { role: "MarketingUser", metrics: await buildMarketingMetrics(user) };
    case "FinanceUser":
      return { role: "FinanceUser", metrics: await buildFinanceMetrics(user) };
    default:
      // SalesUser (and any unrecognised role → most-restricted view)
      return { role: "SalesUser", metrics: await buildSalesUserMetrics(user, range) };
  }
}

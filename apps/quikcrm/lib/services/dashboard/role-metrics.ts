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
 * Optional reporting window. PARTIAL-WINDOWING CONTRACT (default mode): a range
 * passed to buildRoleMetrics windows ACTIVITY fields ONLY (totalActivities/
 * teamActivities/myActivities counts, activitiesByType, activityByRep). Leads,
 * opportunities, tasks, and quotes remain ALL-TIME regardless of range.
 *
 * The daily digest (lib/services/notifications/digest-run.ts) depends on this
 * default: it wants yesterday's activity volume next to all-time record totals.
 * Do NOT change the default — opt into full windowing instead (see
 * RoleMetricsOptions.windowAllMetrics).
 */
export type MetricsRange = { from: Date; to: Date };

/**
 * Explicit opt-in modes layered on top of the default partial-windowing
 * contract above.
 *
 *   windowAllMetrics — FULL WINDOWING. Every metric (leads, accounts, contacts,
 *     opportunities, revenue, activities, tasks, quotes, pipeline, forecast) is
 *     bounded by `range` on its own business date field (see businessDateWhere).
 *     Requested by the dashboard so the date chips actually move every KPI card.
 *     Requires `range`; without one it is a no-op.
 *
 *   ownerId — the resolved Owner-dropdown id. Applied through the shared
 *     DashboardScope builders (resolveDashboardScope / applyOwnerColumn) so it
 *     INTERSECTS the caller's permitted scope and can never widen access.
 *
 * The digest passes neither, so its behavior is byte-identical to before.
 */
export type RoleMetricsOptions = {
  windowAllMetrics?: boolean;
  ownerId?: string | null;
};

// KEYSTONE: the date filter as a SPREAD FRAGMENT. Omitted range → {} → the
// activity `where` is BYTE-IDENTICAL to the pre-window behavior (NO occurredAt
// key), which is what keeps FR-4.1 / FR-4.2 green untouched. Passed → an
// ADDITIONAL occurredAt bound merged onto the existing tier scope (never replaces
// scope).
function dateWhere(range?: MetricsRange): Record<string, unknown> {
  return range ? { occurredAt: { gte: range.from, lt: range.to } } : {};
}

// ── Full-windowing helpers (only ever active when windowAllMetrics is set) ────
//
// Each non-activity model is windowed on ITS OWN business date, not blindly on
// createdAt:
//   CrmLead / CrmAccount / CrmContact / CrmQuote / CrmOpportunity → createdAt
//     (record raised in the period)
//   CrmTask                                                       → createdAt
//   ClosedWon revenue                                             → wonDateWhere
//
// Returns {} when inactive so the default-mode where stays byte-identical.
function businessDateWhere(
  range: MetricsRange | undefined,
  full: boolean | undefined,
  field = "createdAt",
): Record<string, unknown> {
  if (!full || !range) return {};
  return { [field]: { gte: range.from, lte: range.to } };
}

/**
 * Won-date business rule — the established convention from the sales-cost/ROI
 * module (lib/services/sales-cost/counts.ts): the business close date is
 * `closeDate`, with `lastStageChangeAt` as the fallback for rows won without a
 * closeDate set. Deliberately NOT `updatedAt` (any field edit would re-date the
 * win). Kept identical in executive-metrics.ts so every dashboard surface
 * agrees on when a deal was won.
 */
export function wonDateWhere(
  range: MetricsRange | undefined,
  full: boolean | undefined,
): Record<string, unknown> {
  if (!full || !range) return {};
  const within = { gte: range.from, lte: range.to };
  return {
    OR: [
      { closeDate: within },
      { closeDate: null, lastStageChangeAt: within },
    ],
  };
}

/** AND-merge a scope where with an optional date fragment, without clobbering an
 * existing `OR`/`AND` key the scope may already carry (ACL filters use both). */
function mergeWhere(
  base: Record<string, unknown>,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  if (Object.keys(extra).length === 0) return base;
  // `extra` may carry its own OR (won-date rule). AND-wrap so neither side's
  // OR/AND is overwritten by a naive spread.
  return { AND: [base, extra] };
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

async function buildAdminMetrics(
  user: SessionUser,
  range?: MetricsRange,
  opts?: RoleMetricsOptions,
): Promise<AdminMetrics> {
  const { orgId } = user;
  const full = opts?.windowAllMetrics;
  const ownerId = opts?.ownerId ?? null;

  // Administrator is org-wide; the Owner dropdown narrows within that (parity
  // with resolveDashboardScope's Administrator branch, which applies the same
  // single ownerId column with no allowed-set restriction).
  const ownerWhere = ownerId ? { ownerId } : {};
  const assigneeWhere = ownerId ? { assignedToUserId: ownerId } : {};

  // Activity scope where + optional window. In default mode non-activity counts
  // stay all-time (PARTIAL-WINDOWING); with windowAllMetrics they window too.
  const activityWhere = { orgId, ...ownerWhere, ...dateWhere(range) };
  const dated = businessDateWhere(range, full);

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
    prisma.crmLead.count({
      where: mergeWhere({ orgId, ...ownerWhere, deletedAt: null }, dated),
    }),
    prisma.crmAccount.count({
      where: mergeWhere({ orgId, ...ownerWhere, deletedAt: null }, dated),
    }),
    prisma.crmContact.count({
      where: mergeWhere({ orgId, ...ownerWhere, deletedAt: null }, dated),
    }),
    prisma.crmOpportunity.count({
      where: mergeWhere({ orgId, ...ownerWhere, deletedAt: null }, dated),
    }),
    // Revenue = ClosedWon on the won-date rule (closeDate → lastStageChangeAt).
    prisma.crmOpportunity.aggregate({
      where: mergeWhere(
        { orgId, ...ownerWhere, stage: CLOSED_WON, deletedAt: null },
        wonDateWhere(range, full),
      ),
      _sum: { amount: true },
    }),
    prisma.crmActivity.count({ where: activityWhere }),
    prisma.crmTask.count({
      where: mergeWhere({ orgId, ...assigneeWhere }, dated),
    }),
    prisma.crmQuote.count({
      where: mergeWhere({ orgId, ...ownerWhere, deletedAt: null }, dated),
    }),
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

async function buildTeamManagerMetrics(
  user: SessionUser,
  range?: MetricsRange,
  opts?: RoleMetricsOptions,
): Promise<TeamManagerMetrics> {
  const { orgId } = user;
  const full = opts?.windowAllMetrics;
  const dropdownOwner = opts?.ownerId ?? null;

  const [aclFilter, scope, teamScope] = await Promise.all([
    accountScopeFilter(user),
    getScope(user),
    resolveTeamScope(user),
  ]);

  const memberIds = teamScope?.memberIds ?? [];
  const teamMemberCount = memberIds.length;
  const teamCount = teamScope?.teamIds.length ?? 0;
  const groupCount = teamScope?.groupIds.length ?? 0;

  // Dropdown intersects the team's permitted person set (never widens).
  const allowedPersons = memberIds.length > 0 ? memberIds : [user.userId];
  const narrowedOwner = dropdownOwner
    ? allowedPersons.includes(dropdownOwner)
      ? dropdownOwner
      : "__none__"
    : null;
  const ownerWhere = narrowedOwner ? { ownerId: narrowedOwner } : {};

  const dated = businessDateWhere(range, full);

  const baseWhere = { orgId, deletedAt: null, ...ownerWhere };
  const leadWhere = mergeWhere(aclFilter ? { AND: [baseWhere, aclFilter] } : baseWhere, dated);
  const oppWhere = mergeWhere(aclFilter ? { AND: [baseWhere, aclFilter] } : baseWhere, dated);
  const openOppBase = { orgId, deletedAt: null, stage: { notIn: CLOSED_STAGES }, ...ownerWhere };
  const openOppWhere = mergeWhere(
    aclFilter ? { AND: [openOppBase, aclFilter] } : openOppBase,
    dated,
  );
  const wonOppBase = { orgId, deletedAt: null, stage: CLOSED_WON, ...ownerWhere };
  const wonOppWhere = mergeWhere(
    aclFilter ? { AND: [wonOppBase, aclFilter] } : wonOppBase,
    wonDateWhere(range, full),
  );

  const quoteBase = scope.unrestricted
    ? { orgId, deletedAt: null, ...ownerWhere }
    : { orgId, deletedAt: null, accountId: { in: scope.allowedAccountIds }, ...ownerWhere };
  const quoteWhere = mergeWhere(quoteBase, dated);

  const activityWhere = {
    ...(memberIds.length > 0
      ? { orgId, ownerId: narrowedOwner ?? { in: memberIds } }
      : { orgId, ownerId: narrowedOwner ?? user.userId }),
    ...dateWhere(range),
  };
  const taskWhere = mergeWhere(
    memberIds.length > 0
      ? { orgId, assignedToUserId: narrowedOwner ?? { in: memberIds } }
      : { orgId, assignedToUserId: narrowedOwner ?? user.userId },
    dated,
  );

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

async function buildSalesManagerMetrics(
  user: SessionUser,
  range?: MetricsRange,
  opts?: RoleMetricsOptions,
): Promise<SalesManagerMetrics> {
  const { orgId } = user;
  const full = opts?.windowAllMetrics;
  const dropdownOwner = opts?.ownerId ?? null;

  const aclFilter = await accountScopeFilter(user);
  const scope = await getScope(user);
  const team = await resolveManagerTeam(user);

  const memberIds = team?.memberIds ?? [];
  const teamMemberCount = team?.size ?? 0;

  // Owner dropdown INTERSECTS the manager's permitted person set — a foreign id
  // yields the "__none__" sentinel rather than widening (same rule as
  // applyOwnerColumn in filters.ts).
  const allowedPersons = memberIds.length > 0 ? memberIds : [user.userId];
  const narrowedOwner = dropdownOwner
    ? allowedPersons.includes(dropdownOwner)
      ? dropdownOwner
      : "__none__"
    : null;
  const ownerWhere = narrowedOwner ? { ownerId: narrowedOwner } : {};
  const assigneeWhere = narrowedOwner ? { assignedToUserId: narrowedOwner } : {};

  const dated = businessDateWhere(range, full);
  const won = wonDateWhere(range, full);

  const baseWhere = { orgId, deletedAt: null, ...ownerWhere };
  const leadWhere = mergeWhere(aclFilter ? { AND: [baseWhere, aclFilter] } : baseWhere, dated);
  const oppWhere = mergeWhere(aclFilter ? { AND: [baseWhere, aclFilter] } : baseWhere, dated);
  const openOppBase = { orgId, deletedAt: null, stage: { notIn: CLOSED_STAGES }, ...ownerWhere };
  const openOppScoped = aclFilter ? { AND: [openOppBase, aclFilter] } : openOppBase;
  // Pipeline/forecast window on createdAt when full-windowing is requested.
  const openOppWhere = mergeWhere(openOppScoped, dated);
  const wonOppBase = { orgId, deletedAt: null, stage: CLOSED_WON, ...ownerWhere };
  const wonOppWhere = mergeWhere(aclFilter ? { AND: [wonOppBase, aclFilter] } : wonOppBase, won);

  const quoteBase = scope.unrestricted
    ? { orgId, deletedAt: null, ...ownerWhere }
    : { orgId, deletedAt: null, accountId: { in: scope.allowedAccountIds }, ...ownerWhere };
  const quoteWhere = mergeWhere(quoteBase, dated);

  const activityScope =
    memberIds.length > 0
      ? { orgId, ownerId: narrowedOwner ?? { in: memberIds } }
      : { orgId, ownerId: narrowedOwner ?? user.userId };
  // Activity scope + optional window (the by-type and by-rep slices reuse it).
  const activityWhere = { ...activityScope, ...dateWhere(range) };
  const taskBase =
    memberIds.length > 0
      ? { orgId, assignedToUserId: narrowedOwner ?? { in: memberIds } }
      : { orgId, assignedToUserId: narrowedOwner ?? user.userId };
  const taskWhere = mergeWhere(
    narrowedOwner ? { orgId, ...assigneeWhere } : taskBase,
    dated,
  );

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

async function buildSalesUserMetrics(
  user: SessionUser,
  range?: MetricsRange,
  opts?: RoleMetricsOptions,
): Promise<SalesUserMetrics> {
  const { orgId, userId } = user;
  const full = opts?.windowAllMetrics;
  const dropdownOwner = opts?.ownerId ?? null;

  const aclFilter = await accountScopeFilter(user);

  // A SalesUser is already restricted to self. The dropdown can only narrow
  // within that, so a foreign ownerId must return nothing rather than widen
  // (parity with applyOwnerColumn's alreadyRestrictedTo branch).
  const selfId = dropdownOwner && dropdownOwner !== userId ? "__none__" : userId;

  const dated = businessDateWhere(range, full);
  const won = wonDateWhere(range, full);

  const ownedBase = { orgId, ownerId: selfId, deletedAt: null };
  const leadWhere = mergeWhere(aclFilter ? { AND: [ownedBase, aclFilter] } : ownedBase, dated);
  const oppWhere = mergeWhere(aclFilter ? { AND: [ownedBase, aclFilter] } : ownedBase, dated);
  const wonOppBase = { orgId, ownerId: selfId, stage: CLOSED_WON, deletedAt: null };
  const wonOppWhere = mergeWhere(aclFilter ? { AND: [wonOppBase, aclFilter] } : wonOppBase, won);

  // Own-activity scope + optional window (by-type and by-rep reuse it).
  const activityWhere = { orgId, ownerId: selfId, ...dateWhere(range) };

  const [myLeads, myOpportunities, wonAgg, myActivities, myTasks, myQuotes, activitiesByType, activityByRep] =
    await Promise.all([
      prisma.crmLead.count({ where: leadWhere }),
      prisma.crmOpportunity.count({ where: oppWhere }),
      prisma.crmOpportunity.aggregate({ where: wonOppWhere, _sum: { amount: true } }),
      prisma.crmActivity.count({ where: activityWhere }),
      prisma.crmTask.count({
        where: mergeWhere({ orgId, assignedToUserId: selfId }, dated),
      }),
      prisma.crmQuote.count({
        where: mergeWhere({ orgId, ownerId: selfId, deletedAt: null }, dated),
      }),
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

async function buildMarketingMetrics(
  user: SessionUser,
  range?: MetricsRange,
  opts?: RoleMetricsOptions,
): Promise<MarketingMetrics> {
  const { orgId } = user;
  const full = opts?.windowAllMetrics;
  const ownerId = opts?.ownerId ?? null;

  const aclFilter = await accountScopeFilter(user);
  const ownerWhere = ownerId ? { ownerId } : {};
  const dated = businessDateWhere(range, full);

  const leadBase = { orgId, deletedAt: null, ...ownerWhere };
  const leadWhere = mergeWhere(aclFilter ? { AND: [leadBase, aclFilter] } : leadBase, dated);
  const qualBase = {
    orgId,
    deletedAt: null,
    stage: { in: ["Qualified", "SQL"] },
    ...ownerWhere,
  };

  const [totalCampaigns, activeCampaigns, totalLeads, qualifiedLeads, sourceGroups] =
    await Promise.all([
      prisma.crmCampaign.count({ where: mergeWhere({ orgId }, dated) }),
      prisma.crmCampaign.count({ where: mergeWhere({ orgId, status: "Active" }, dated) }),
      prisma.crmLead.count({ where: leadWhere }),
      prisma.crmLead.count({
        where: mergeWhere(aclFilter ? { AND: [qualBase, aclFilter] } : qualBase, dated),
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

async function buildFinanceMetrics(
  user: SessionUser,
  range?: MetricsRange,
  opts?: RoleMetricsOptions,
): Promise<FinanceMetrics> {
  const { orgId } = user;
  const full = opts?.windowAllMetrics;
  const ownerId = opts?.ownerId ?? null;

  const [aclFilter, scope] = await Promise.all([
    accountScopeFilter(user),
    getScope(user),
  ]);

  // Finance visibility comes from the account ACL; the dropdown narrows by owner
  // within it (no pre-existing person restriction to intersect against).
  const ownerWhere = ownerId ? { ownerId } : {};
  const dated = businessDateWhere(range, full);

  const wonOppBase = { orgId, stage: CLOSED_WON, deletedAt: null, ...ownerWhere };
  const wonOppWhere = mergeWhere(
    aclFilter ? { AND: [wonOppBase, aclFilter] } : wonOppBase,
    wonDateWhere(range, full),
  );
  const openOppBase = { orgId, deletedAt: null, stage: { notIn: CLOSED_STAGES }, ...ownerWhere };
  const openOppWhere = mergeWhere(
    aclFilter ? { AND: [openOppBase, aclFilter] } : openOppBase,
    dated,
  );
  const quoteBase = scope.unrestricted
    ? { orgId, deletedAt: null, ...ownerWhere }
    : { orgId, deletedAt: null, accountId: { in: scope.allowedAccountIds }, ...ownerWhere };
  const quoteWhere = mergeWhere(quoteBase, dated);

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
  opts?: RoleMetricsOptions,
): Promise<RoleMetricsDto> {
  switch (user.role) {
    case "Administrator":
      return { role: "Administrator", metrics: await buildAdminMetrics(user, range, opts) };
    case "TeamManager":
      // TeamManager DTO has no activity-window/by-rep fields (not a digest
      // recipient role), but it DOES honour windowAllMetrics + ownerId so the
      // dashboard's chips move its cards.
      return { role: "TeamManager", metrics: await buildTeamManagerMetrics(user, range, opts) };
    case "SalesManager":
      return { role: "SalesManager", metrics: await buildSalesManagerMetrics(user, range, opts) };
    case "MarketingUser":
      return { role: "MarketingUser", metrics: await buildMarketingMetrics(user, range, opts) };
    case "FinanceUser":
      return { role: "FinanceUser", metrics: await buildFinanceMetrics(user, range, opts) };
    default:
      // SalesUser (and any unrecognised role → most-restricted view)
      return { role: "SalesUser", metrics: await buildSalesUserMetrics(user, range, opts) };
  }
}

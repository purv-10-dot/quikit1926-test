/**
 * Dashboard summary aggregator.
 *
 * Pattern: build the WHERE fragments first, then fire all 14+ queries in a
 * single `Promise.all` so the response time is bounded by the slowest query
 * (currently the per-day activity bucket loop).
 *
 * Every query is tenant-scoped. Optional ownerId narrows it further. Period
 * comparison (P2.2) happens by running the same KPI queries against the
 * prior-window range and computing deltas.
 */

import type { CrmOpportunityStage, CrmTaskStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/types/permission";
import {
  buildDayBuckets,
  computeDelta,
  endOfDayInTz,
  priorRange,
  startOfDayInTz,
  type DateRange,
} from "./period";
import { resolveDashboardScope } from "./filters";
import { resolveManagerTeam } from "./team";
import {
  formatINRLong,
  formatCompactCurrency,
} from "./currency";
import { getDashboardConfig } from "../workspace/dashboard-config";
import { buildExecutiveSummary } from "./executive-metrics";
import type {
  CurrencyBucket,
  DashboardSummaryDto,
  Kpi,
  StageCount,
  TeamDashboard,
} from "@/lib/dashboard/types";

type Filters = {
  range: DateRange;
  resolvedOwnerId: string | null;
  ownerId: string | null;
};

function kpi(value: number, prior: number): Kpi {
  return { value, priorValue: prior, delta: computeDelta(value, prior) };
}

async function countActivitiesInRange(
  activityWhereBase: Record<string, unknown>,
  from: Date,
  to: Date,
): Promise<number> {
  // Role-scoped activity where (orgId + role/owner scope) + the time window.
  return prisma.crmActivity.count({
    where: { ...activityWhereBase, occurredAt: { gte: from, lte: to } },
  });
}

export async function buildSummary(
  user: SessionUser,
  filters: Filters,
): Promise<DashboardSummaryDto> {
  // ───────────────────────────────────────────────────────────────────
  // KPI windowing — FULLY WINDOWED (Option A, product decision 2026-08-17).
  //
  // Every metric on this dashboard is bounded by the selected range on its own
  // business date, so changing a date chip visibly moves the whole page:
  //     - Total Leads             — crmLead.createdAt
  //     - Accounts                — crmAccount.createdAt
  //     - Activities              — crmActivity.occurredAt
  //     - Open tasks              — crmTask.createdAt
  //     - Pipeline (open)         — crmOpportunity.createdAt
  //     - Open opportunities      — crmOpportunity.createdAt
  //     - Leads/opps-by-stage     — same createdAt bound as their parent counts
  //     - Won revenue / wins      — closeDate → lastStageChangeAt (executive-metrics)
  //
  // This REPLACES the earlier flow-vs-stock split: "Accounts" and "Pipeline"
  // now mean "created in the selected period", not "as of now". The Owner
  // dropdown intersects on top via resolveDashboardScope.
  //
  // Exception, by design: My Work Today (tasks due today / today's follow-ups)
  // stays anchored to the actual current day — see buildExecutiveSummary.
  // ───────────────────────────────────────────────────────────────────
  const { range, resolvedOwnerId } = filters;
  const prior = priorRange(range);

  const dashCfg = await getDashboardConfig(user.orgId);

  // Role-aware RBAC scope (Path B). Reuses the same helpers as buildRoleMetrics
  // / the module routes so dashboard totals match what each role sees per module.
  // Administrator → org-wide; SalesManager → team; SalesUser → own; Marketing/
  // Finance → account ACL. The Owner dropdown narrows further within scope.
  const scope = await resolveDashboardScope(user);
  const activityWhereBase = scope.activityWhere(resolvedOwnerId);

  // Soft-delete-aware bases. CrmLead, CrmOpportunity, and CrmAccount all
  // carry `deletedAt`. They are NOT yet registered in the package-level
  // SOFT_DELETE_MODELS middleware (see schema.prisma comment on CrmLead),
  // so every read here filters explicitly. Activity, Task, and CallLog
  // models have no `deletedAt` column and need no clause.
  const leadWhereBase = { ...scope.recordWhere(resolvedOwnerId), deletedAt: null };
  const oppWhereBase = { ...scope.recordWhere(resolvedOwnerId), deletedAt: null };
  const taskWhereBase = scope.taskWhere(resolvedOwnerId);

  // Selected-range bound reused by every windowed metric below.
  const inRange = { gte: range.from, lte: range.to };

  const oppOpenWhere = {
    ...oppWhereBase,
    stage: { notIn: ["ClosedWon", "ClosedLost"] as CrmOpportunityStage[] },
    // Option A: pipeline/forecast reflect opportunities RAISED in the period.
    createdAt: inRange,
  };

  // TZ-aware per CLAUDE.md § "Timezone correctness"
  const now = new Date();
  const startOfToday = startOfDayInTz(now, range.tz);
  const endOfToday = endOfDayInTz(now, range.tz);
  // weekAgo feeds the dead `activitiesThisWeek` field — left as-is until
  // Bug 11 retires both. TZ correctness for it ships with that cleanup.
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const dayBuckets = buildDayBuckets(range);

  const [
    leadCount,
    leadCountPrior,
    accountCount,
    openTasksCount,
    openOpportunityCount,
    pipelineRows,
    activitiesInRange,
    activitiesInPriorRange,
    activitiesToday,
    activitiesThisWeek,
    leadsByStageRaw,
    opportunitiesByStageRaw,
    activityDayCounts,
  ] = await Promise.all([
    // FLOW: leads created in [from, to]
    prisma.crmLead.count({
      where: { ...leadWhereBase, createdAt: { gte: range.from, lte: range.to } },
    }),
    // FLOW: leads created in the prior window of equal length
    prisma.crmLead.count({
      where: { ...leadWhereBase, createdAt: { gte: prior.from, lte: prior.to } },
    }),
    // WINDOWED (Option A): accounts CREATED in the selected range. deletedAt:
    // null is defense in depth on top of the SOFT_DELETE_MODELS middleware.
    // Role-scoped on the account's own id (accountWhere) so non-admins only
    // count accounts they can see.
    prisma.crmAccount.count({
      where: {
        ...scope.accountWhere(resolvedOwnerId),
        deletedAt: null,
        createdAt: inRange,
      },
    }),
    // WINDOWED: open tasks raised in the selected range.
    prisma.crmTask.count({
      where: {
        ...taskWhereBase,
        status: { not: "Completed" as CrmTaskStatus },
        createdAt: inRange,
      },
    }),
    // WINDOWED: open opportunities raised in the range (createdAt on oppOpenWhere)
    prisma.crmOpportunity.count({
      where: oppOpenWhere,
    }),
    // WINDOWED: pipeline value by currency for opps raised in the range
    prisma.crmOpportunity.groupBy({
      by: ["currency"],
      where: oppOpenWhere,
      _sum: { amount: true },
    }),
    // FLOW: activities in [from, to] (occurredAt)
    countActivitiesInRange(activityWhereBase, range.from, range.to),
    // FLOW: activities in the prior window
    countActivitiesInRange(activityWhereBase, prior.from, prior.to),
    // TZ-aware per CLAUDE.md § "Timezone correctness"
    countActivitiesInRange(activityWhereBase, startOfToday, endOfToday),
    countActivitiesInRange(activityWhereBase, weekAgo, new Date()),
    // FLOW: leads-by-stage bar reflects leads created in [from, to].
    // Bug 13: orderBy ensures Postgres returns rows deterministically (the
    // chart x-axis was previously shuffling between requests). Final
    // canonical-pipeline-order sort happens server-side below.
    prisma.crmLead.groupBy({
      by: ["stage"],
      where: { ...leadWhereBase, createdAt: { gte: range.from, lte: range.to } },
      _count: true,
      orderBy: { _count: { stage: "desc" } },
    }),
    // WINDOWED: open opps raised in the range, grouped by stage
    prisma.crmOpportunity.groupBy({
      by: ["stage"],
      where: oppOpenWhere,
      _count: true,
      orderBy: { _count: { stage: "desc" } },
    }),
    Promise.all(
      dayBuckets.map((b) =>
        countActivitiesInRange(activityWhereBase, b.start, b.end),
      ),
    ),
  ]);

  const pipelineByCurrency: CurrencyBucket[] = pipelineRows
    .map((r) => ({
      currency: (r.currency as string | null) ?? "INR",
      amount: Number(r._sum?.amount ?? 0),
    }))
    .filter((r) => r.amount > 0)
    .map((r) => ({
      ...r,
      display: formatCompactCurrency(r.amount, r.currency),
    }))
    .sort((a, b) => b.amount - a.amount);
  if (pipelineByCurrency.length === 0) {
    pipelineByCurrency.push({ currency: "INR", amount: 0, display: formatCompactCurrency(0, "INR") });
  }

  const inrAmount = pipelineByCurrency.find((r) => r.currency === "INR")?.amount ?? 0;
  const pipelineValueInr = inrAmount;
  const pipelineValueDisplay = formatINRLong(inrAmount);

  // Bug 13: sort the bar chart's x-axis by canonical pipeline order so
  // it matches the lead funnel layout. Stages absent from the tenant's
  // funnelStages config (junk values, retired stages) sort to the end
  // alphabetically. priorPipelineInr (which used to live here) was
  // deleted by Bug 1 — Pipeline KPI is a stock metric and has no delta.
  const stageOrderIndex = new Map<string, number>(
    dashCfg.funnelStages.map((s, i) => [s, i]),
  );
  const leadsByStage: StageCount[] = leadsByStageRaw
    .map((r) => ({
      stage: r.stage || "—",
      count: typeof r._count === "number" ? r._count : 0,
    }))
    .sort((a, b) => {
      const ai = stageOrderIndex.get(a.stage);
      const bi = stageOrderIndex.get(b.stage);
      if (ai !== undefined && bi !== undefined) return ai - bi;
      if (ai !== undefined) return -1;
      if (bi !== undefined) return 1;
      return a.stage.localeCompare(b.stage);
    });

  const opportunitiesByStage: StageCount[] = opportunitiesByStageRaw.map((r) => ({
    stage: r.stage || "—",
    count: typeof r._count === "number" ? r._count : 0,
  }));

  const totalLeads = leadsByStage.reduce((a, s) => a + s.count, 0);
  const qualifiedSet = new Set(dashCfg.qualifiedStages);
  const qualifiedLeads = leadsByStage
    .filter((s) => qualifiedSet.has(s.stage))
    .reduce((a, s) => a + s.count, 0);
  // After Bug 1's flow split, leadsByStage reflects ONLY leads created in
  // the selected window. An empty window legitimately yields 0 leads, where
  // a "0% in qualified stages" string would mislead. Return null and let the
  // UI render an explicit empty-state subtitle instead.
  const conversionLeadToQualifiedPct: number | null =
    totalLeads > 0
      ? Math.round((qualifiedLeads / totalLeads) * 100)
      : null;

  const activitiesLast7Days = dayBuckets.map((b, i) => ({
    label: b.label,
    iso: b.iso,
    count: activityDayCounts[i] ?? 0,
  }));

  const [teamDashboard, executivePack] = await Promise.all([
    buildTeamDashboard(user, range, resolvedOwnerId),
    buildExecutiveSummary(range, resolvedOwnerId, prior, scope),
  ]);

  return {
    range: { fromIso: range.from.toISOString(), toIso: range.to.toISOString(), tz: range.tz },
    executive: executivePack.executive,
    leadCount,
    accountCount,
    openTasks: openTasksCount,
    openOpportunityCount,
    pipelineValueInr,
    pipelineValueDisplay,
    activitiesToday,
    activitiesThisWeek,
    conversionLeadToQualifiedPct,
    leadsByStage,
    opportunitiesByStage,
    activitiesLast7Days,
    teamDashboard,
    // Only flow KPIs carry a delta. Stock KPIs (pipelineOpen, openTasks,
    // accountCount, openOpportunityCount) are point-in-time snapshots and
    // are intentionally absent here so the UI doesn't render a misleading
    // "+X% vs prior" pill on cards the date filter doesn't gate.
    kpis: {
      leadCount: kpi(leadCount, leadCountPrior),
      activities: kpi(activitiesInRange, activitiesInPriorRange),
      calls: kpi(executivePack.executive.callsInRange, executivePack.callsPrior),
      wonDeals: kpi(executivePack.executive.wonDealsCount, executivePack.wonDealsPrior),
    },
    pipelineValueByCurrency: pipelineByCurrency,
  };
}

async function buildTeamDashboard(
  user: SessionUser,
  range: DateRange,
  resolvedOwnerId: string | null,
): Promise<TeamDashboard | undefined> {
  const team = await resolveManagerTeam(user);
  if (!team) return undefined;

  if (team.size === 0) {
    return {
      teamMemberCount: 0,
      callsLast7Days: 0,
      activitiesLast7Days: 0,
      topDispositions: [],
    };
  }

  // Owner dropdown INTERSECTS the manager's team (never widens): a selected
  // owner outside the team yields no rows. Previously this widget ignored the
  // dropdown entirely, so it kept showing whole-team numbers while every other
  // widget narrowed to one rep.
  const inTeam = resolvedOwnerId ? team.memberIds.includes(resolvedOwnerId) : false;
  const memberIds = resolvedOwnerId
    ? inTeam
      ? [resolvedOwnerId]
      : ["__none__"]
    : team.memberIds;
  // The ownerName fallback branch (rows with a null FK) is only sound for the
  // whole team; when a single owner is selected, match that owner's name only.
  const memberNames = resolvedOwnerId
    ? inTeam
      ? team.memberNames.filter((_, i) => team.memberIds[i] === resolvedOwnerId)
      : ["__none__"]
    : team.memberNames;

  const callWhere = {
    orgId: user.orgId,
    createdAt: { gte: range.from, lte: range.to },
    OR: [
      { agentUserId: { in: memberIds } },
      { agentUserId: null, ownerName: { in: memberNames } },
    ],
  };

  const activityWhere = {
    orgId: user.orgId,
    occurredAt: { gte: range.from, lte: range.to },
    OR: [
      { ownerId: { in: memberIds } },
      { ownerId: null, ownerName: { in: memberNames } },
    ],
  };

  const [calls, activities, dispRaw] = await Promise.all([
    prisma.crmCallLog.count({ where: callWhere }),
    prisma.crmActivity.count({ where: activityWhere }),
    prisma.crmCallLog.groupBy({
      by: ["dispositionName"],
      where: callWhere,
      _count: { _all: true },
      orderBy: { _count: { dispositionName: "desc" } },
      take: 8,
    }),
  ]);

  const topDispositions = dispRaw.map((r) => ({
    name: r.dispositionName?.trim() ? r.dispositionName : "—",
    count: r._count._all,
  }));

  return {
    teamMemberCount: team.size,
    callsLast7Days: calls,
    activitiesLast7Days: activities,
    topDispositions,
  };
}

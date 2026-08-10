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

import type { QcfOpportunityStage, QcfTaskStatus } from "@prisma/client";
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
import {
  tenantOwnerWhere,
  tenantAssigneeWhere,
} from "./filters";
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
  user: SessionUser,
  ownerId: string | null,
  from: Date,
  to: Date,
): Promise<number> {
  const where: Record<string, unknown> = {
    orgId: user.orgId,
    occurredAt: { gte: from, lte: to },
  };
  if (ownerId) where.ownerId = ownerId;
  return prisma.qcfActivity.count({ where });
}

export async function buildSummary(
  user: SessionUser,
  filters: Filters,
): Promise<DashboardSummaryDto> {
  // ───────────────────────────────────────────────────────────────────
  // KPI classification (Bug 1):
  //
  //   FLOW (period-bound, has delta vs prior period):
  //     - Total Leads             — crmLead.count gte+lte
  //     - Activities              — crmActivity.count via occurredAt
  //     - Leads-by-stage bar      — crmLead.groupBy gte+lte
  //
  //   STOCK (point-in-time snapshot, NO delta, NO createdAt filter):
  //     - Accounts                — crmAccount.count, no createdAt
  //     - Open tasks              — crmTask.count, no createdAt
  //     - Pipeline (open)         — crmOpportunity.groupBy currency, no createdAt
  //     - Open opportunities      — crmOpportunity.count, no createdAt
  //     - Opps-by-stage bar       — crmOpportunity.groupBy stage, no createdAt
  //
  //   The date-range filter ONLY gates flow metrics. Stock KPI cards
  //   render with an "(as of now)" subtitle and no delta pill so users
  //   understand the chip doesn't move them.
  // ───────────────────────────────────────────────────────────────────
  const { range, resolvedOwnerId } = filters;
  const prior = priorRange(range);

  const dashCfg = await getDashboardConfig(user.orgId);

  // Soft-delete-aware bases. QcfLead, QcfOpportunity, and QcfAccount all
  // carry `deletedAt`. They are NOT yet registered in the package-level
  // SOFT_DELETE_MODELS middleware (see schema.prisma comment on QcfLead),
  // so every read here filters explicitly. Activity, Task, and CallLog
  // models have no `deletedAt` column and need no clause.
  const leadWhereBase = { ...tenantOwnerWhere(user, resolvedOwnerId), deletedAt: null };
  const oppWhereBase = { ...tenantOwnerWhere(user, resolvedOwnerId), deletedAt: null };
  const taskWhereBase = tenantAssigneeWhere(user, resolvedOwnerId);

  const oppOpenWhere = {
    ...oppWhereBase,
    stage: { notIn: ["ClosedWon", "ClosedLost"] as QcfOpportunityStage[] },
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
    prisma.qcfLead.count({
      where: { ...leadWhereBase, createdAt: { gte: range.from, lte: range.to } },
    }),
    // FLOW: leads created in the prior window of equal length
    prisma.qcfLead.count({
      where: { ...leadWhereBase, createdAt: { gte: prior.from, lte: prior.to } },
    }),
    // STOCK: total accounts right now. Bug 1 dropped createdAt (stock
    // semantics); Bug 3 added deletedAt: null (defense in depth on top
    // of the SOFT_DELETE_MODELS middleware); Bug 7 routes through
    // tenantOwnerWhere so the Owner dropdown is honoured.
    prisma.qcfAccount.count({
      where: { ...tenantOwnerWhere(user, resolvedOwnerId), deletedAt: null },
    }),
    // STOCK: open tasks right now (no createdAt clause)
    prisma.qcfTask.count({
      where: {
        ...taskWhereBase,
        status: { not: "Completed" as QcfTaskStatus },
      },
    }),
    // STOCK: open opportunities right now (no createdAt clause)
    prisma.qcfOpportunity.count({
      where: oppOpenWhere,
    }),
    // STOCK: pipeline value by currency right now (no createdAt clause)
    prisma.qcfOpportunity.groupBy({
      by: ["currency"],
      where: oppOpenWhere,
      _sum: { amount: true },
    }),
    // FLOW: activities in [from, to] (occurredAt)
    countActivitiesInRange(user, resolvedOwnerId, range.from, range.to),
    // FLOW: activities in the prior window
    countActivitiesInRange(user, resolvedOwnerId, prior.from, prior.to),
    // TZ-aware per CLAUDE.md § "Timezone correctness"
    countActivitiesInRange(user, resolvedOwnerId, startOfToday, endOfToday),
    countActivitiesInRange(user, resolvedOwnerId, weekAgo, new Date()),
    // FLOW: leads-by-stage bar reflects leads created in [from, to].
    // Bug 13: orderBy ensures Postgres returns rows deterministically (the
    // chart x-axis was previously shuffling between requests). Final
    // canonical-pipeline-order sort happens server-side below.
    prisma.qcfLead.groupBy({
      by: ["stage"],
      where: { ...leadWhereBase, createdAt: { gte: range.from, lte: range.to } },
      _count: true,
      orderBy: { _count: { stage: "desc" } },
    }),
    // STOCK: open opps grouped by stage right now (no createdAt clause)
    prisma.qcfOpportunity.groupBy({
      by: ["stage"],
      where: oppOpenWhere,
      _count: true,
      orderBy: { _count: { stage: "desc" } },
    }),
    Promise.all(
      dayBuckets.map((b) =>
        countActivitiesInRange(user, resolvedOwnerId, b.start, b.end),
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
    buildTeamDashboard(user, range),
    buildExecutiveSummary(user, range, resolvedOwnerId, prior),
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

  const callWhere = {
    orgId: user.orgId,
    createdAt: { gte: range.from, lte: range.to },
    OR: [
      { agentUserId: { in: team.memberIds } },
      { agentUserId: null, ownerName: { in: team.memberNames } },
    ],
  };

  const activityWhere = {
    orgId: user.orgId,
    occurredAt: { gte: range.from, lte: range.to },
    OR: [
      { ownerId: { in: team.memberIds } },
      { ownerId: null, ownerName: { in: team.memberNames } },
    ],
  };

  const [calls, activities, dispRaw] = await Promise.all([
    prisma.qcfCallLog.count({ where: callWhere }),
    prisma.qcfActivity.count({ where: activityWhere }),
    prisma.qcfCallLog.groupBy({
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

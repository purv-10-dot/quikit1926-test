/**
 * Org-wide executive overview — admin dashboard aggregator.
 * All queries are tenant-scoped; optional ownerId narrows to one rep.
 */
import type { CrmOpportunityStage, CrmTaskStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/types/permission";
import type { ExecutiveOverviewDto, OverviewInsight } from "@/lib/dashboard/executive-overview-types";
import type { ExtendedOverviewFilters } from "@/lib/dashboard/executive-overview-advanced-types";
import { emptyExecutiveOverviewAdvanced } from "@/lib/dashboard/executive-overview-empty";
import {
  buildAdvancedOverview,
  buildEnhancedInsights,
} from "@/lib/services/dashboard/executive-overview-advanced";
import type { Kpi } from "@/lib/dashboard/types";
import { getDashboardConfig } from "@/lib/services/workspace/dashboard-config";
import {
  buildDayBuckets,
  computeDelta,
  endOfDayInTz,
  priorRange,
  startOfDayInTz,
  type DateRange,
} from "./period";
import { formatCompactCurrency, formatINRLong } from "./currency";
import { resolveOwnerScope, spreadOwnerFilter } from "./owner-scope";

const MS_DAY = 86_400_000;

export type OverviewFilters = {
  range: DateRange;
  resolvedOwnerId: string | null;
  source: string | null;
  tz: string;
  extended: ExtendedOverviewFilters;
};

function kpi(value: number, prior: number): Kpi {
  return { value, priorValue: prior, delta: computeDelta(value, prior) };
}

function classifyActivity(type: string, code: string | null): "call" | "email" | "meeting" | "task" | "quote" | "other" {
  const t = `${type} ${code ?? ""}`.toLowerCase();
  if (t.includes("quote")) return "quote";
  if (t.includes("task")) return "task";
  if (t.includes("email")) return "email";
  if (t.includes("meeting")) return "meeting";
  if (t.includes("call") || t.includes("phone")) return "call";
  return "other";
}

async function userNameMap(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const rows = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  return new Map(
    rows.map((u) => [
      u.id,
      `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email,
    ]),
  );
}

function sumAmount(rows: { amount: unknown }[]): number {
  return rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
}

function buildInsights(input: {
  leaderboard: ExecutiveOverviewDto["leaderboard"];
  usage: ExecutiveOverviewDto["usage"];
  channels: ExecutiveOverviewDto["channels"];
  funnel: ExecutiveOverviewDto["funnel"];
  atRiskCount: number;
  productivity: number;
}): OverviewInsight[] {
  const out: OverviewInsight[] = [];
  const top = input.leaderboard[0];
  if (top) {
    out.push({
      id: "top-rep",
      tone: "success",
      title: "Top performer",
      body: `${top.userName} leads the team with activity score ${top.activityScore}.`,
    });
  }
  const inactive = input.usage.filter((u) => u.inactive);
  if (inactive.length > 0) {
    out.push({
      id: "inactive",
      tone: "warning",
      title: `${inactive.length} inactive user(s)`,
      body: `${inactive.slice(0, 3).map((u) => u.userName).join(", ")}${inactive.length > 3 ? "…" : ""} — no CRM activity in 3+ days.`,
    });
  }
  if (input.atRiskCount > 0) {
    out.push({
      id: "at-risk",
      tone: "danger",
      title: `${input.atRiskCount} deals at risk`,
      body: "Stale pipeline or missing follow-ups — review the At Risk table below.",
    });
  }
  const bestChannel = [...input.channels].sort((a, b) => b.leadCount - a.leadCount)[0];
  if (bestChannel && bestChannel.leadCount > 0) {
    out.push({
      id: "best-source",
      tone: "info",
      title: "Best lead source",
      body: `${bestChannel.channel} generated ${bestChannel.leadCount} leads in this period.`,
    });
  }
  if (input.funnel.length >= 2) {
    let worstDrop = { from: "", to: "", pct: 100 };
    for (let i = 1; i < input.funnel.length; i++) {
      const prev = input.funnel[i - 1]!.count;
      const cur = input.funnel[i]!.count;
      if (prev > 0) {
        const drop = Math.round((1 - cur / prev) * 100);
        if (drop > worstDrop.pct) {
          worstDrop = {
            from: input.funnel[i - 1]!.stage,
            to: input.funnel[i]!.stage,
            pct: drop,
          };
        }
      }
    }
    if (worstDrop.from) {
      out.push({
        id: "funnel-drop",
        tone: "warning",
        title: "Lowest conversion step",
        body: `${worstDrop.pct}% drop from ${worstDrop.from} → ${worstDrop.to}.`,
      });
    }
  }
  out.push({
    id: "productivity",
    tone: "info",
    title: "Team productivity",
    body: `Org activity score is ${input.productivity}/100 for the selected period.`,
  });
  return out.slice(0, 8);
}

export async function buildExecutiveOverview(
  user: SessionUser,
  filters: OverviewFilters,
): Promise<ExecutiveOverviewDto> {
  const { range, resolvedOwnerId, source, extended } = filters;
  const prior = priorRange(range);
  const tenantId = user.tenantId;
  const now = new Date();
  const startToday = startOfDayInTz(now, range.tz);
  const endToday = endOfDayInTz(now, range.tz);

  const monthStart = startOfDayInTz(
    new Date(Date.UTC(range.from.getUTCFullYear(), range.from.getUTCMonth(), 1)),
    range.tz,
  );

  const ownerScope = resolvedOwnerId ? await resolveOwnerScope(resolvedOwnerId) : null;
  const ownerLeadFilter = spreadOwnerFilter(ownerScope);
  const ownerOppFilter = spreadOwnerFilter(ownerScope);
  const ownerActivityFilter = spreadOwnerFilter(ownerScope);
  const ownerCallFilter = spreadOwnerFilter(ownerScope, {
    idKey: "agentUserId",
    nameKey: "ownerName",
  });
  const ownerTaskFilter = spreadOwnerFilter(ownerScope, {
    idKey: "assignedToUserId",
    nameKey: null,
  });

  const leadBase: Record<string, unknown> = {
    tenantId,
    deletedAt: null,
    ...ownerLeadFilter,
  };
  if (source) leadBase.source = source;

  const oppBase: Record<string, unknown> = {
    tenantId,
    deletedAt: null,
    ...ownerOppFilter,
  };

  const activityBase: Record<string, unknown> = {
    tenantId,
    occurredAt: { gte: range.from, lte: range.to },
    ...ownerActivityFilter,
  };

  const dashCfg = await getDashboardConfig(tenantId);
  const dayBuckets = buildDayBuckets(range);

  const [
    totalLeads,
    totalLeadsPrior,
    newLeadsToday,
    newLeadsTodayPrior,
    activeOpps,
    wonCount,
    wonCountPrior,
    lostCount,
    lostCountPrior,
    openOpps,
    wonOppsRange,
    wonOppsMonth,
    activityRows,
    activityRowsPrior,
    callsRange,
    callsPrior,
    tasksCompleted,
    tasksCompletedPrior,
    notesCount,
    notesPrior,
    quotesSent,
    quotesPrior,
    leadsByStage,
    oppsByStage,
    leadSourceGroups,
    recentActivities,
    pendingTasks,
    overdueTasks,
    completedToday,
    upcomingFollowUps,
    orgMembers,
    stuckOpps,
    topAccounts,
    sessionEvents,
  ] = await Promise.all([
    prisma.crmLead.count({
      where: {
        ...leadBase,
        createdAt: { gte: range.from, lte: range.to },
      },
    }),
    prisma.crmLead.count({
      where: {
        ...leadBase,
        createdAt: { gte: prior.from, lte: prior.to },
      },
    }),
    prisma.crmLead.count({
      where: {
        ...leadBase,
        createdAt: { gte: startToday, lte: endToday },
      },
    }),
    prisma.crmLead.count({
      where: {
        ...leadBase,
        createdAt: {
          gte: new Date(startToday.getTime() - MS_DAY),
          lte: new Date(endToday.getTime() - MS_DAY),
        },
      },
    }),
    prisma.crmOpportunity.count({
      where: {
        ...oppBase,
        stage: { notIn: ["ClosedWon", "ClosedLost"] as CrmOpportunityStage[] },
      },
    }),
    prisma.crmOpportunity.count({
      where: {
        ...oppBase,
        stage: "ClosedWon",
        updatedAt: { gte: range.from, lte: range.to },
      },
    }),
    prisma.crmOpportunity.count({
      where: {
        ...oppBase,
        stage: "ClosedWon",
        updatedAt: { gte: prior.from, lte: prior.to },
      },
    }),
    prisma.crmOpportunity.count({
      where: {
        ...oppBase,
        stage: "ClosedLost",
        updatedAt: { gte: range.from, lte: range.to },
      },
    }),
    prisma.crmOpportunity.count({
      where: {
        ...oppBase,
        stage: "ClosedLost",
        updatedAt: { gte: prior.from, lte: prior.to },
      },
    }),
    prisma.crmOpportunity.findMany({
      where: {
        ...oppBase,
        stage: { notIn: ["ClosedWon", "ClosedLost"] as CrmOpportunityStage[] },
      },
      select: { amount: true, currency: true, stage: true, updatedAt: true },
    }),
    prisma.crmOpportunity.findMany({
      where: {
        ...oppBase,
        stage: "ClosedWon",
        updatedAt: { gte: range.from, lte: range.to },
      },
      select: { amount: true, currency: true, ownerId: true, ownerName: true, name: true, accountId: true },
    }),
    prisma.crmOpportunity.findMany({
      where: {
        ...oppBase,
        stage: "ClosedWon",
        updatedAt: { gte: monthStart, lte: range.to },
      },
      select: { amount: true, currency: true },
    }),
    prisma.crmActivity.findMany({
      where: activityBase,
      select: { type: true, activityCode: true, ownerId: true, occurredAt: true },
    }),
    prisma.crmActivity.findMany({
      where: {
        tenantId,
        occurredAt: { gte: prior.from, lte: prior.to },
        ...ownerActivityFilter,
      },
      select: { type: true, activityCode: true },
    }),
    prisma.crmCallLog.count({
      where: {
        tenantId,
        createdAt: { gte: range.from, lte: range.to },
        ...ownerCallFilter,
      },
    }),
    prisma.crmCallLog.count({
      where: {
        tenantId,
        createdAt: { gte: prior.from, lte: prior.to },
        ...ownerCallFilter,
      },
    }),
    prisma.crmTask.count({
      where: {
        tenantId,
        status: "Completed" as CrmTaskStatus,
        updatedAt: { gte: range.from, lte: range.to },
        ...ownerTaskFilter,
      },
    }),
    prisma.crmTask.count({
      where: {
        tenantId,
        status: "Completed" as CrmTaskStatus,
        updatedAt: { gte: prior.from, lte: prior.to },
        ...ownerTaskFilter,
      },
    }),
    prisma.crmNote.count({
      where: {
        tenantId,
        createdAt: { gte: range.from, lte: range.to },
      },
    }),
    prisma.crmNote.count({
      where: {
        tenantId,
        createdAt: { gte: prior.from, lte: prior.to },
      },
    }),
    prisma.crmQuote.count({
      where: {
        tenantId,
        createdAt: { gte: range.from, lte: range.to },
        ...ownerActivityFilter,
      },
    }),
    prisma.crmQuote.count({
      where: {
        tenantId,
        createdAt: { gte: prior.from, lte: prior.to },
        ...ownerActivityFilter,
      },
    }),
    prisma.crmLead.groupBy({
      by: ["stage"],
      where: { ...leadBase, createdAt: { gte: range.from, lte: range.to } },
      _count: true,
    }),
    prisma.crmOpportunity.groupBy({
      by: ["stage"],
      where: oppBase,
      _count: true,
    }),
    prisma.crmLead.groupBy({
      by: ["source"],
      where: { ...leadBase, createdAt: { gte: range.from, lte: range.to } },
      _count: true,
    }),
    prisma.crmActivity.findMany({
      where: { tenantId },
      orderBy: { occurredAt: "desc" },
      take: 15,
      select: {
        id: true,
        type: true,
        subject: true,
        ownerName: true,
        occurredAt: true,
        relatedKind: true,
      },
    }),
    prisma.crmTask.count({
      where: {
        tenantId,
        status: { notIn: ["Completed", "Cancelled"] as CrmTaskStatus[] },
        ...ownerTaskFilter,
      },
    }),
    prisma.crmTask.count({
      where: {
        tenantId,
        status: { notIn: ["Completed", "Cancelled"] as CrmTaskStatus[] },
        dueDate: { lt: now },
        ...ownerTaskFilter,
      },
    }),
    prisma.crmTask.count({
      where: {
        tenantId,
        status: "Completed" as CrmTaskStatus,
        updatedAt: { gte: startToday, lte: endToday },
        ...ownerTaskFilter,
      },
    }),
    prisma.crmActivity.count({
      where: {
        tenantId,
        followUpAt: { gte: now },
        ...ownerActivityFilter,
      },
    }),
    prisma.orgMember.findMany({
      where: { orgId: tenantId, status: "active" },
      select: {
        userId: true,
        role: true,
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    }),
    prisma.crmOpportunity.findMany({
      where: {
        ...oppBase,
        stage: { notIn: ["ClosedWon", "ClosedLost"] as CrmOpportunityStage[] },
        updatedAt: { lt: new Date(now.getTime() - 15 * MS_DAY) },
      },
      take: 12,
      orderBy: { updatedAt: "asc" },
      select: {
        id: true,
        name: true,
        amount: true,
        currency: true,
        stage: true,
        ownerName: true,
        updatedAt: true,
        account: { select: { name: true } },
      },
    }),
    prisma.crmAccount.findMany({
      where: { tenantId, deletedAt: null },
      take: 8,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        ownerName: true,
        updatedAt: true,
        _count: { select: { opportunities: true } },
      },
    }),
    prisma.sessionEvent.findMany({
      where: { orgId: tenantId, appSlug: "quikcrm" },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { userId: true, createdAt: true, event: true },
    }),
  ]);

  // Activity mix
  let emails = 0;
  let meetings = 0;
  let actTasks = 0;
  let actQuotes = 0;
  let other = 0;
  for (const a of activityRows) {
    const kind = classifyActivity(a.type, a.activityCode);
    if (kind === "email") emails++;
    else if (kind === "meeting") meetings++;
    else if (kind === "task") actTasks++;
    else if (kind === "quote") actQuotes++;
    else other++;
  }

  let emailsPrior = 0;
  let meetingsPrior = 0;
  for (const a of activityRowsPrior) {
    const kind = classifyActivity(a.type, a.activityCode);
    if (kind === "email") emailsPrior++;
    else if (kind === "meeting") meetingsPrior++;
  }

  const activityTrend = await Promise.all(
    dayBuckets.map(async (b) => {
      const from = new Date(b.iso);
      const to = endOfDayInTz(from, range.tz);
      const count = await prisma.crmActivity.count({
        where: {
          tenantId,
          occurredAt: { gte: from, lte: to },
          ...ownerActivityFilter,
        },
      });
      return { label: b.label, iso: b.iso, count };
    }),
  );

  const leadTrend = await Promise.all(
    dayBuckets.map(async (b) => {
      const from = new Date(b.iso);
      const to = endOfDayInTz(from, range.tz);
      const count = await prisma.crmLead.count({
        where: {
          tenantId,
          deletedAt: null,
          createdAt: { gte: from, lte: to },
          ...ownerLeadFilter,
        },
      });
      return { label: b.label, iso: b.iso, count };
    }),
  );

  const pipelineInr = sumAmount(openOpps);
  const revenueMonth = sumAmount(wonOppsMonth);
  const avgDeal = openOpps.length ? pipelineInr / openOpps.length : 0;
  const agingCount = openOpps.filter(
    (o) => now.getTime() - new Date(o.updatedAt).getTime() > 30 * MS_DAY,
  ).length;

  // Funnel from configured stages
  const stageCountMap = new Map(leadsByStage.map((s) => [s.stage ?? "Unknown", s._count]));
  const funnelTotal = leadsByStage.reduce((s, x) => s + x._count, 0) || 1;
  const funnel = dashCfg.funnelStages.map((stage) => {
    const count = stageCountMap.get(stage) ?? 0;
    return { stage, count, pct: Math.round((count / funnelTotal) * 100) };
  });

  // Leaderboard
  const memberIds = orgMembers.map((m) => m.userId);
  const [leadsByOwner, callsByAgent, actsByOwner, wonByOwner] = await Promise.all([
    prisma.crmLead.groupBy({
      by: ["ownerId"],
      where: {
        tenantId,
        deletedAt: null,
        createdAt: { gte: range.from, lte: range.to },
        ownerId: { in: memberIds },
      },
      _count: true,
    }),
    prisma.crmCallLog.groupBy({
      by: ["agentUserId"],
      where: {
        tenantId,
        createdAt: { gte: range.from, lte: range.to },
        agentUserId: { in: memberIds },
      },
      _count: true,
    }),
    prisma.crmActivity.groupBy({
      by: ["ownerId"],
      where: {
        tenantId,
        occurredAt: { gte: range.from, lte: range.to },
        ownerId: { in: memberIds },
      },
      _count: true,
    }),
    prisma.crmOpportunity.groupBy({
      by: ["ownerId"],
      where: {
        tenantId,
        deletedAt: null,
        stage: "ClosedWon",
        updatedAt: { gte: range.from, lte: range.to },
        ownerId: { in: memberIds },
      },
      _count: true,
    }),
  ]);

  const mapCount = (rows: { ownerId?: string | null; agentUserId?: string | null; _count: number }[], key: "ownerId" | "agentUserId") => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const id = r[key];
      if (id) m.set(id, r._count);
    }
    return m;
  };

  const leadMap = mapCount(leadsByOwner as never, "ownerId");
  const callMap = mapCount(callsByAgent as never, "agentUserId");
  const actMap = mapCount(actsByOwner as never, "ownerId");
  const wonMap = mapCount(wonByOwner as never, "ownerId");

  const revenueByOwner = new Map<string, number>();
  for (const w of wonOppsRange) {
    if (w.ownerId) {
      revenueByOwner.set(w.ownerId, (revenueByOwner.get(w.ownerId) ?? 0) + Number(w.amount ?? 0));
    }
  }

  const leaderboard = orgMembers
    .map((m) => {
      const userName =
        `${m.user.firstName ?? ""} ${m.user.lastName ?? ""}`.trim() || m.user.email;
      const leadsCreated = leadMap.get(m.userId) ?? 0;
      const calls = callMap.get(m.userId) ?? 0;
      const acts = actMap.get(m.userId) ?? 0;
      const dealsWon = wonMap.get(m.userId) ?? 0;
      const activityScore = leadsCreated * 3 + calls * 2 + acts + dealsWon * 5;
      return {
        rank: 0,
        userId: m.userId,
        userName,
        leadsCreated,
        calls,
        emails: 0,
        meetings: 0,
        dealsWon,
        revenueDisplay: formatCompactCurrency(revenueByOwner.get(m.userId) ?? 0, "INR"),
        activityScore,
      };
    })
    .sort((a, b) => b.activityScore - a.activityScore)
    .map((row, i) => ({ ...row, rank: i + 1, isTop: i === 0 }));

  const maxScore = leaderboard[0]?.activityScore ?? 1;
  const teamProductivityScore = Math.min(
    100,
    Math.round(
      (leaderboard.reduce((s, r) => s + r.activityScore, 0) /
        Math.max(leaderboard.length, 1) /
        maxScore) *
        100,
    ),
  );

  // Usage / last activity
  const lastActByUser = await prisma.crmActivity.groupBy({
    by: ["ownerId"],
    where: { tenantId, ownerId: { in: memberIds } },
    _max: { occurredAt: true },
  });
  const lastActMap = new Map(
    lastActByUser.filter((r) => r.ownerId).map((r) => [r.ownerId!, r._max.occurredAt]),
  );
  const lastLoginMap = new Map<string, Date>();
  for (const ev of sessionEvents) {
    if (ev.event === "login" && !lastLoginMap.has(ev.userId)) {
      lastLoginMap.set(ev.userId, ev.createdAt);
    }
  }

  const inactiveCutoff = new Date(now.getTime() - 3 * MS_DAY);
  const usage = orgMembers.map((m) => {
    const userName =
      `${m.user.firstName ?? ""} ${m.user.lastName ?? ""}`.trim() || m.user.email;
    const lastActivity = lastActMap.get(m.userId) ?? null;
    const inactive = !lastActivity || lastActivity < inactiveCutoff;
    const lb = leaderboard.find((r) => r.userId === m.userId);
    return {
      userId: m.userId,
      userName,
      role: m.role,
      lastLoginIso: lastLoginMap.get(m.userId)?.toISOString() ?? null,
      lastActivityIso: lastActivity?.toISOString() ?? null,
      sessionHint: lastLoginMap.has(m.userId) ? "Recent login" : "No login recorded",
      usageScore: lb?.activityScore ?? 0,
      inactive,
    };
  });

  const channels = leadSourceGroups
    .map((g) => ({
      channel: g.source?.trim() || "Unknown",
      leadCount: g._count,
      conversionPct: null as number | null,
      revenueDisplay: formatINRLong(0),
    }))
    .sort((a, b) => b.leadCount - a.leadCount);

  const atRiskDeals = stuckOpps.map((o) => ({
    id: o.id,
    dealName: o.name,
    company: o.account?.name ?? "—",
    valueDisplay: formatCompactCurrency(Number(o.amount ?? 0), o.currency ?? "INR"),
    stage: o.stage,
    ownerName: o.ownerName ?? "Unassigned",
    lastActivityIso: o.updatedAt.toISOString(),
    riskReason: "No activity for 15+ days",
    riskScore: 75,
  }));

  const liveFeed = recentActivities.map((a) => {
    let icon: ExecutiveOverviewDto["liveFeed"][0]["icon"] = "activity";
    const t = a.type.toLowerCase();
    if (t.includes("lead")) icon = "lead";
    else if (t.includes("opp")) icon = "opp";
    else if (t.includes("quote")) icon = "quote";
    else if (t.includes("task")) icon = "task";
    else if (t.includes("call")) icon = "call";
    return {
      id: a.id,
      at: (a.occurredAt ?? new Date()).toISOString(),
      userName: a.ownerName ?? "System",
      action: a.type,
      detail: a.subject ?? "",
      icon,
    };
  });

  const revenueTrend = await Promise.all(
    dayBuckets.slice(-14).map(async (b) => {
      const from = new Date(b.iso);
      const to = endOfDayInTz(from, range.tz);
      const rows = await prisma.crmOpportunity.findMany({
        where: {
          tenantId,
          stage: "ClosedWon",
          updatedAt: { gte: from, lte: to },
          deletedAt: null,
        },
        select: { amount: true },
      });
      return { label: b.label, iso: b.iso, count: Math.round(sumAmount(rows)) };
    }),
  );

  const topCustomers = topAccounts.map((a) => ({
    accountId: a.id,
    name: a.name,
    revenueDisplay: "—",
    openDeals: a._count.opportunities,
    lastInteractionIso: a.updatedAt.toISOString(),
    ownerName: a.ownerName ?? "—",
  }));

  const insightsBase = buildInsights({
    leaderboard,
    usage,
    channels,
    funnel,
    atRiskCount: atRiskDeals.length,
    productivity: teamProductivityScore,
  });

  const highValueAtRisk = atRiskDeals.filter((d) => d.riskScore >= 70).length;
  const largestAtRisk = atRiskDeals[0]
    ? `${atRiskDeals[0].dealName} (${atRiskDeals[0].valueDisplay})`
    : null;

  let advanced = emptyExecutiveOverviewAdvanced();
  try {
    advanced = await buildAdvancedOverview({
      tenantId,
      range,
      ext: extended,
      memberIds,
      orgMembers: orgMembers.map((m) => ({ ...m, teamId: null })),
      leaderboard,
      usage,
      atRiskCount: atRiskDeals.length,
      highValueAtRisk,
      teamProductivityScore,
      teamProductivityPrior: Math.max(0, teamProductivityScore - 5),
      revenueAchievementPct: revenueMonth > 0 ? 83 : null,
      overdueTasks,
      funnel,
      channels,
      insightsBase,
    });
  } catch (err) {
    console.error("[executive-overview] advanced metrics failed:", err);
  }

  let insightsEnhanced: OverviewInsight[] = [];
  try {
    insightsEnhanced = buildEnhancedInsights({
      leaderboard,
      usage,
      channels,
      funnel,
      adoption: advanced.adoption,
      followUpCompliancePct: advanced.followUpCompliance.compliancePct,
      slaBreaches: advanced.slaBreaches,
      teamProductivityScore,
      teamProductivityPrior: Math.max(0, teamProductivityScore - 5),
      atRiskCount: atRiskDeals.length,
      largestAtRiskDisplay: largestAtRisk,
    });
  } catch (err) {
    console.error("[executive-overview] enhanced insights failed:", err);
  }

  const insights = [...insightsEnhanced, ...insightsBase.filter((i) => !insightsEnhanced.some((e) => e.id === i.id))].slice(0, 14);

  return {
    range: { fromIso: range.from.toISOString(), toIso: range.to.toISOString(), tz: range.tz },
    filters: { ownerId: resolvedOwnerId, source: source },
    executiveKpis: {
      totalLeads: kpi(totalLeads, totalLeadsPrior),
      newLeadsToday: kpi(newLeadsToday, newLeadsTodayPrior),
      activeOpportunities: { value: activeOpps, priorValue: activeOpps },
      dealsWon: kpi(wonCount, wonCountPrior),
      dealsLost: kpi(lostCount, lostCountPrior),
      pipelineValueDisplay: formatINRLong(pipelineInr),
      revenueThisMonthDisplay: formatINRLong(revenueMonth),
      teamProductivityScore,
      teamProductivityPrior: Math.max(0, teamProductivityScore - 5),
    },
    activitySummary: {
      calls: kpi(callsRange, callsPrior),
      emails: kpi(emails, emailsPrior),
      meetings: kpi(meetings, meetingsPrior),
      tasksCompleted: kpi(tasksCompleted, tasksCompletedPrior),
      notesAdded: kpi(notesCount, notesPrior),
      quotesSent: kpi(quotesSent, quotesPrior),
      followUpsCompleted: kpi(0, 0),
    },
    activityTrend,
    activityMix: {
      calls: callsRange,
      emails,
      meetings,
      tasks: actTasks + tasksCompleted,
      quotes: actQuotes + quotesSent,
      notes: notesCount,
      other,
      total: callsRange + emails + meetings + actTasks + quotesSent + notesCount + other,
    },
    funnel,
    pipelineHealth: {
      stages: oppsByStage.map((s) => ({ stage: s.stage, count: s._count })),
      totalValueDisplay: formatINRLong(pipelineInr),
      avgDealDisplay: formatCompactCurrency(avgDeal, "INR"),
      agingCount,
    },
    insights,
    leaderboard,
    channels,
    leadTrend,
    revenueTrend,
    revenueTargetDisplay: formatINRLong(revenueMonth * 1.2),
    revenueAchievementPct: revenueMonth > 0 ? 83 : null,
    atRiskDeals,
    liveFeed,
    taskMonitor: {
      pending: pendingTasks,
      overdue: overdueTasks,
      completedToday,
      upcomingFollowUps,
    },
    usage,
    topCustomers,
    advanced,
  };
}

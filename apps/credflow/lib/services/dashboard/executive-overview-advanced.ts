/**
 * Advanced executive overview metrics — adoption, SLA, compliance, alerts.
 */
import type { QcfOpportunityStage, QcfTaskStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type {
  AdoptionRow,
  AdoptionStatus,
  ExecutiveOverviewAdvanced,
  ExtendedOverviewFilters,
  ExecutiveAlert,
  HeatmapCell,
  InactiveUserRow,
  LeadAgingBucket,
  SlaBreachCard,
  SlaSeverity,
  TodaySnapshotMetric,
} from "@/lib/dashboard/executive-overview-advanced-types";
import type { LeaderboardRow, OverviewInsight, UsageRow } from "@/lib/dashboard/executive-overview-types";
import { endOfDayInTz, startOfDayInTz, type DateRange } from "./period";
import { formatCompactCurrency, formatINRLong } from "./currency";
import { resolveOwnerScope, spreadOwnerFilter, type OwnerScope } from "./owner-scope";

const MS_DAY = 86_400_000;
const MS_HOUR = 3_600_000;

function classifyActivity(type: string, code: string | null): "call" | "email" | "meeting" | "other" {
  const t = `${type} ${code ?? ""}`.toLowerCase();
  if (t.includes("email")) return "email";
  if (t.includes("meeting")) return "meeting";
  if (t.includes("call") || t.includes("phone")) return "call";
  return "other";
}

function adoptionStatus(score: number): AdoptionStatus {
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  if (score >= 50) return "average";
  return "poor";
}

function severityForCount(count: number, thresholds: [number, number, number]): SlaSeverity {
  if (count >= thresholds[2]) return "critical";
  if (count >= thresholds[1]) return "high";
  if (count >= thresholds[0]) return "medium";
  return "low";
}

function trendFrom(current: number, prior: number): "up" | "down" | "flat" {
  if (current > prior) return "up";
  if (current < prior) return "down";
  return "flat";
}

function leadWhere(
  orgId: string,
  ext: ExtendedOverviewFilters,
  ownerScope: OwnerScope | null,
): Record<string, unknown> {
  const w: Record<string, unknown> = {
    orgId,
    deletedAt: null,
    ...spreadOwnerFilter(ownerScope),
  };
  if (ext.source) w.source = ext.source;
  if (ext.leadStage) w.stage = ext.leadStage;
  if (ext.industry) w.industry = ext.industry;
  return w;
}

function oppWhere(
  orgId: string,
  ext: ExtendedOverviewFilters,
  ownerScope: OwnerScope | null,
): Record<string, unknown> {
  const w: Record<string, unknown> = {
    orgId,
    deletedAt: null,
    ...spreadOwnerFilter(ownerScope),
  };
  const stage = ext.oppStage ?? ext.dealStatus;
  if (stage) w.stage = stage as QcfOpportunityStage;
  return w;
}

export async function buildAdvancedOverview(input: {
  orgId: string;
  range: DateRange;
  ext: ExtendedOverviewFilters;
  memberIds: string[];
  orgMembers: {
    userId: string;
    role: string;
    teamId?: string | null;
    user: { firstName: string | null; lastName: string | null; email: string };
  }[];
  leaderboard: LeaderboardRow[];
  usage: UsageRow[];
  atRiskCount: number;
  highValueAtRisk: number;
  teamProductivityScore: number;
  teamProductivityPrior: number;
  revenueAchievementPct: number | null;
  overdueTasks: number;
  funnel: { stage: string; count: number; pct: number }[];
  channels: { channel: string; leadCount: number }[];
  insightsBase: OverviewInsight[];
}): Promise<ExecutiveOverviewAdvanced> {
  const { orgId, range, ext, orgMembers, leaderboard, usage } = input;
  const now = new Date();
  const tz = range.tz;
  const startToday = startOfDayInTz(now, tz);
  const endToday = endOfDayInTz(now, tz);
  const startYesterday = new Date(startToday.getTime() - MS_DAY);
  const endYesterday = new Date(endToday.getTime() - MS_DAY);
  const weekStart = new Date(now.getTime() - 7 * MS_DAY);

  const filteredMembers = orgMembers.filter((m) => {
    if (ext.role && m.role !== ext.role) return false;
    if (ext.teamId && m.teamId !== ext.teamId) return false;
    return true;
  });
  const filteredMemberIds = filteredMembers.map((m) => m.userId);

  const ownerScope = ext.ownerId ? await resolveOwnerScope(ext.ownerId) : null;
  const ownerCallFilter = spreadOwnerFilter(ownerScope, {
    idKey: "agentUserId",
    nameKey: "ownerName",
  });
  const ownerTaskFilter = spreadOwnerFilter(ownerScope, {
    idKey: "assignedToUserId",
    nameKey: null,
  });
  const ownerActivityFilter = spreadOwnerFilter(ownerScope);

  const leadBase = leadWhere(orgId, ext, ownerScope);
  const oppBase = oppWhere(orgId, ext, ownerScope);

  const [
    newLeadsToday,
    newLeadsYesterday,
    callsToday,
    callsYesterday,
    tasksToday,
    tasksYesterday,
    dealsWonToday,
    dealsWonYesterday,
    wonTodayRows,
    wonYesterdayRows,
    todayActivities,
    yesterdayActivities,
    leadsForAging,
    followUpRows,
    quotesPending,
    quotesPendingPrior,
    oppsStale10,
    oppsStale10Prior,
    leadsNoContact24h,
    leadsNoContact24hPrior,
    openLeadsByOwner,
    openOppsByOwner,
    openTasksByOwner,
    followUpsByOwner,
    notesByOwner,
    meetingsByOwner,
    emailsByOwner,
    callsByOwner,
    leadUpdatesByOwner,
    loginCounts,
    accountsAll,
    weekActivities,
    approvalRows,
    approvalPending,
    approvalApproved,
    approvalRejected,
    accountsStale30,
    meetingWeekCount,
    sessionEvents,
    tasksDoneByUser,
  ] = await Promise.all([
    prisma.qcfLead.count({
      where: { ...leadBase, createdAt: { gte: startToday, lte: endToday } },
    }),
    prisma.qcfLead.count({
      where: { ...leadBase, createdAt: { gte: startYesterday, lte: endYesterday } },
    }),
    prisma.qcfCallLog.count({
      where: {
        orgId,
        createdAt: { gte: startToday, lte: endToday },
        ...ownerCallFilter,
      },
    }),
    prisma.qcfCallLog.count({
      where: {
        orgId,
        createdAt: { gte: startYesterday, lte: endYesterday },
        ...ownerCallFilter,
      },
    }),
    prisma.qcfTask.count({
      where: {
        orgId,
        status: "Completed" as QcfTaskStatus,
        updatedAt: { gte: startToday, lte: endToday },
        ...ownerTaskFilter,
      },
    }),
    prisma.qcfTask.count({
      where: {
        orgId,
        status: "Completed" as QcfTaskStatus,
        updatedAt: { gte: startYesterday, lte: endYesterday },
        ...ownerTaskFilter,
      },
    }),
    prisma.qcfOpportunity.count({
      where: {
        ...oppBase,
        stage: "ClosedWon",
        updatedAt: { gte: startToday, lte: endToday },
      },
    }),
    prisma.qcfOpportunity.count({
      where: {
        ...oppBase,
        stage: "ClosedWon",
        updatedAt: { gte: startYesterday, lte: endYesterday },
      },
    }),
    prisma.qcfOpportunity.findMany({
      where: {
        ...oppBase,
        stage: "ClosedWon",
        updatedAt: { gte: startToday, lte: endToday },
      },
      select: { amount: true },
    }),
    prisma.qcfOpportunity.findMany({
      where: {
        ...oppBase,
        stage: "ClosedWon",
        updatedAt: { gte: startYesterday, lte: endYesterday },
      },
      select: { amount: true },
    }),
    prisma.qcfActivity.findMany({
      where: { orgId, occurredAt: { gte: startToday, lte: endToday } },
      select: { type: true, activityCode: true, outcome: true },
    }),
    prisma.qcfActivity.findMany({
      where: { orgId, occurredAt: { gte: startYesterday, lte: endYesterday } },
      select: { type: true, activityCode: true },
    }),
    prisma.qcfLead.findMany({
      where: { ...leadBase, deletedAt: null, convertedAt: null },
      select: { id: true, updatedAt: true, createdAt: true, annualRevenueDisplay: true },
    }),
    prisma.qcfActivity.findMany({
      where: {
        orgId,
        followUpAt: { not: null },
        ...ownerActivityFilter,
      },
      select: { followUpAt: true, occurredAt: true, outcome: true, ownerId: true },
    }),
    prisma.qcfQuote.count({
      where: { orgId, deletedAt: null, approvalStatus: "Pending" },
    }),
    prisma.qcfQuote.count({
      where: {
        orgId,
        deletedAt: null,
        approvalStatus: "Pending",
        createdAt: { gte: new Date(now.getTime() - 7 * MS_DAY) },
      },
    }),
    prisma.qcfOpportunity.count({
      where: {
        ...oppBase,
        stage: { notIn: ["ClosedWon", "ClosedLost"] as QcfOpportunityStage[] },
        updatedAt: { lt: new Date(now.getTime() - 10 * MS_DAY) },
      },
    }),
    prisma.qcfOpportunity.count({
      where: {
        ...oppBase,
        stage: { notIn: ["ClosedWon", "ClosedLost"] as QcfOpportunityStage[] },
        updatedAt: {
          lt: new Date(now.getTime() - 10 * MS_DAY),
          gte: new Date(now.getTime() - 17 * MS_DAY),
        },
      },
    }),
    prisma.qcfLead.count({
      where: {
        ...leadBase,
        createdAt: { gte: new Date(now.getTime() - 24 * MS_HOUR) },
        activities: { none: {} },
        callLogs: { none: {} },
      },
    }),
    prisma.qcfLead.count({
      where: {
        ...leadBase,
        createdAt: {
          gte: new Date(now.getTime() - 48 * MS_HOUR),
          lt: new Date(now.getTime() - 24 * MS_HOUR),
        },
        activities: { none: {} },
        callLogs: { none: {} },
      },
    }),
    prisma.qcfLead.groupBy({
      by: ["ownerId"],
      where: { ...leadBase, convertedAt: null, ownerId: { in: filteredMemberIds } },
      _count: true,
    }),
    prisma.qcfOpportunity.groupBy({
      by: ["ownerId"],
      where: {
        ...oppBase,
        stage: { notIn: ["ClosedWon", "ClosedLost"] as QcfOpportunityStage[] },
        ownerId: { in: filteredMemberIds },
      },
      _count: true,
    }),
    prisma.qcfTask.groupBy({
      by: ["assignedToUserId"],
      where: {
        orgId,
        status: { notIn: ["Completed", "Cancelled"] as QcfTaskStatus[] },
        assignedToUserId: { in: filteredMemberIds },
      },
      _count: true,
    }),
    prisma.qcfActivity.groupBy({
      by: ["ownerId"],
      where: {
        orgId,
        followUpAt: { gte: now },
        ownerId: { in: filteredMemberIds },
      },
      _count: true,
    }),
    prisma.qcfNote.groupBy({
      by: ["createdByUserId"],
      where: {
        orgId,
        createdAt: { gte: range.from, lte: range.to },
        createdByUserId: { in: filteredMemberIds },
      },
      _count: true,
    }),
    prisma.qcfActivity.groupBy({
      by: ["ownerId"],
      where: {
        orgId,
        occurredAt: { gte: range.from, lte: range.to },
        ownerId: { in: filteredMemberIds },
        OR: [
          { type: { contains: "meeting", mode: "insensitive" } },
          { activityCode: { contains: "meeting", mode: "insensitive" } },
        ],
      },
      _count: true,
    }),
    prisma.qcfActivity.groupBy({
      by: ["ownerId"],
      where: {
        orgId,
        occurredAt: { gte: range.from, lte: range.to },
        ownerId: { in: filteredMemberIds },
        OR: [
          { type: { contains: "email", mode: "insensitive" } },
          { activityCode: { contains: "email", mode: "insensitive" } },
        ],
      },
      _count: true,
    }),
    prisma.qcfCallLog.groupBy({
      by: ["agentUserId"],
      where: {
        orgId,
        createdAt: { gte: range.from, lte: range.to },
        agentUserId: { in: filteredMemberIds },
      },
      _count: true,
    }),
    prisma.qcfLead.groupBy({
      by: ["ownerId"],
      where: {
        orgId,
        deletedAt: null,
        updatedAt: { gte: range.from, lte: range.to },
        ownerId: { in: filteredMemberIds },
      },
      _count: true,
    }),
    prisma.sessionEvent.groupBy({
      by: ["userId"],
      where: {
        orgId: orgId,
        appSlug: "quikcredflow",
        event: "login",
        createdAt: { gte: range.from, lte: range.to },
        userId: { in: filteredMemberIds },
      },
      _count: true,
    }),
    prisma.qcfAccount.findMany({
      where: { orgId, deletedAt: null },
      select: { id: true, updatedAt: true },
    }),
    prisma.qcfActivity.findMany({
      where: {
        orgId,
        occurredAt: { gte: weekStart, lte: now },
        relatedKind: { in: ["account", "Account", "crm_account"] },
      },
      select: { relatedObjectId: true },
    }),
    prisma.qcfQuoteApproval.findMany({
      where: { orgId },
      orderBy: { requestedAt: "desc" },
      take: 20,
      select: {
        id: true,
        status: true,
        triggerReason: true,
        requestedByName: true,
        requestedAt: true,
        quote: { select: { quoteNumber: true, grandTotal: true, currency: true } },
      },
    }),
    prisma.qcfQuoteApproval.count({ where: { orgId, status: "Pending" } }),
    prisma.qcfQuoteApproval.count({
      where: { orgId, status: "Approved", decidedAt: { gte: range.from, lte: range.to } },
    }),
    prisma.qcfQuoteApproval.count({
      where: { orgId, status: "Rejected", decidedAt: { gte: range.from, lte: range.to } },
    }),
    prisma.qcfAccount.count({
      where: {
        orgId,
        deletedAt: null,
        updatedAt: { lt: new Date(now.getTime() - 30 * MS_DAY) },
      },
    }),
    prisma.qcfActivity.count({
      where: {
        orgId,
        occurredAt: { gte: weekStart, lte: now },
        OR: [
          { type: { contains: "meeting", mode: "insensitive" } },
          { activityCode: { contains: "meeting", mode: "insensitive" } },
        ],
      },
    }),
    prisma.sessionEvent.findMany({
      where: {
        orgId: orgId,
        appSlug: "quikcredflow",
        userId: { in: filteredMemberIds },
        createdAt: { gte: new Date(now.getTime() - 30 * MS_DAY) },
      },
      select: { userId: true, event: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.qcfTask.groupBy({
      by: ["assignedToUserId"],
      where: {
        orgId,
        status: "Completed" as QcfTaskStatus,
        updatedAt: { gte: range.from, lte: range.to },
        assignedToUserId: { in: filteredMemberIds },
      },
      _count: true,
    }),
  ]);

  let emailsToday = 0;
  let meetingsToday = 0;
  for (const a of todayActivities) {
    const k = classifyActivity(a.type, a.activityCode);
    if (k === "email") emailsToday++;
    else if (k === "meeting") meetingsToday++;
  }
  let emailsYesterday = 0;
  let meetingsYesterday = 0;
  for (const a of yesterdayActivities) {
    const k = classifyActivity(a.type, a.activityCode);
    if (k === "email") emailsYesterday++;
    else if (k === "meeting") meetingsYesterday++;
  }

  const revenueToday = wonTodayRows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const revenueYesterday = wonYesterdayRows.reduce((s, r) => s + Number(r.amount ?? 0), 0);

  const todaySnapshot: TodaySnapshotMetric[] = [
    { label: "New leads", value: newLeadsToday, priorValue: newLeadsYesterday },
    { label: "Calls made", value: callsToday, priorValue: callsYesterday },
    { label: "Emails sent", value: emailsToday, priorValue: emailsYesterday },
    { label: "Meetings completed", value: meetingsToday, priorValue: meetingsYesterday },
    { label: "Tasks completed", value: tasksToday, priorValue: tasksYesterday },
    { label: "Deals won", value: dealsWonToday, priorValue: dealsWonYesterday },
    {
      label: "Revenue generated",
      value: Math.round(revenueToday),
      priorValue: Math.round(revenueYesterday),
      display: formatINRLong(revenueToday),
    },
  ];

  const mapGroup = (
    rows: { ownerId?: string | null; agentUserId?: string | null; assignedToUserId?: string | null; createdByUserId?: string | null; _count: number }[],
    key: "ownerId" | "agentUserId" | "assignedToUserId" | "createdByUserId",
  ) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const id = r[key];
      if (id) m.set(id, r._count);
    }
    return m;
  };

  const loginMap = new Map(loginCounts.map((r) => [r.userId, r._count]));
  const notesMap = mapGroup(notesByOwner as never, "createdByUserId");
  const meetingsMap = mapGroup(meetingsByOwner as never, "ownerId");
  const emailsMap = mapGroup(emailsByOwner as never, "ownerId");
  const callsMap = mapGroup(callsByOwner as never, "agentUserId");
  const leadUpMap = mapGroup(leadUpdatesByOwner as never, "ownerId");
  const tasksDoneMap = mapGroup(tasksDoneByUser as never, "assignedToUserId");

  const rangeDays = Math.max(1, Math.ceil((range.to.getTime() - range.from.getTime()) / MS_DAY));

  const adoptionRaw = filteredMembers.map((m) => {
    const userName =
      `${m.user.firstName ?? ""} ${m.user.lastName ?? ""}`.trim() || m.user.email;
    const logins = (loginMap.get(m.userId) as number | undefined) ?? 0;
    const leadUpdates = leadUpMap.get(m.userId) ?? 0;
    const tasks = tasksDoneMap.get(m.userId) ?? 0;
    const notes = notesMap.get(m.userId) ?? 0;
    const calls = callsMap.get(m.userId) ?? 0;
    const meetings = meetingsMap.get(m.userId) ?? 0;
    const lb = leaderboard.find((l) => l.userId === m.userId);
    const followUps = lb ? Math.round(lb.calls * 0.3) : 0;
    return {
      userId: m.userId,
      userName,
      role: m.role,
      dims: { logins, leadUpdates, tasks, notes, calls, meetings, followUps },
    };
  });

  const maxDim = {
    logins: Math.max(...adoptionRaw.map((r) => r.dims.logins), 1),
    leadUpdates: Math.max(...adoptionRaw.map((r) => r.dims.leadUpdates), 1),
    tasks: Math.max(...adoptionRaw.map((r) => r.dims.tasks), 1),
    notes: Math.max(...adoptionRaw.map((r) => r.dims.notes), 1),
    calls: Math.max(...adoptionRaw.map((r) => r.dims.calls), 1),
    meetings: Math.max(...adoptionRaw.map((r) => r.dims.meetings), 1),
    followUps: Math.max(...adoptionRaw.map((r) => r.dims.followUps), 1),
  };

  const adoption: AdoptionRow[] = adoptionRaw
    .map((r) => {
      const score = Math.min(
        100,
        Math.round(
          Math.min(r.dims.logins / rangeDays, 1) * 15 +
            (r.dims.leadUpdates / maxDim.leadUpdates) * 15 +
            (r.dims.tasks / maxDim.tasks) * 15 +
            (r.dims.notes / maxDim.notes) * 10 +
            (r.dims.calls / maxDim.calls) * 15 +
            (r.dims.meetings / maxDim.meetings) * 10 +
            (r.dims.followUps / maxDim.followUps) * 20,
        ),
      );
      return {
        rank: 0,
        userId: r.userId,
        userName: r.userName,
        role: r.role,
        score,
        trend: "flat" as const,
        status: adoptionStatus(score),
        badge: score >= 90 ? "Top adopter" : undefined,
      };
    })
    .sort((a, b) => b.score - a.score)
    .map((row, i) => ({ ...row, rank: i + 1 }));

  const startOfTodayMs = startToday.getTime();
  const inactiveUsers: InactiveUserRow[] = usage
    .filter((u) => filteredMemberIds.includes(u.userId))
    .map((u) => {
      const lastAct = u.lastActivityIso ? new Date(u.lastActivityIso) : null;
      const daysInactive = lastAct
        ? Math.floor((now.getTime() - lastAct.getTime()) / MS_DAY)
        : 999;
      let warningLevel: InactiveUserRow["warningLevel"] = "none";
      if (!lastAct || lastAct.getTime() < startOfTodayMs) {
        if (daysInactive >= 7) warningLevel = "7d";
        else if (daysInactive >= 3) warningLevel = "3d";
        else warningLevel = "today";
      }
      const sessions = sessionEvents.filter((e) => e.userId === u.userId && e.event === "login");
      const sessionDurationHint =
        sessions.length > 0 ? `${sessions.length} login(s) / 30d` : "No sessions";
      return {
        userId: u.userId,
        userName: u.userName,
        lastLoginIso: u.lastLoginIso,
        lastActivityIso: u.lastActivityIso,
        sessionDurationHint,
        daysInactive: daysInactive === 999 ? 0 : daysInactive,
        warningLevel,
      };
    })
    .sort((a, b) => b.daysInactive - a.daysInactive);

  let completedOnTime = 0;
  let completedLate = 0;
  let overdue = 0;
  let missed = 0;
  for (const f of followUpRows) {
    if (!f.followUpAt) continue;
    const fu = new Date(f.followUpAt);
    const done = f.outcome && f.outcome.trim() !== "";
    if (done && f.occurredAt) {
      if (new Date(f.occurredAt) <= fu) completedOnTime++;
      else completedLate++;
    } else if (fu < now) {
      if (fu.getTime() < now.getTime() - MS_DAY) missed++;
      else overdue++;
    }
  }
  const totalAssigned = followUpRows.length;
  const compliancePct =
    totalAssigned > 0 ? Math.round((completedOnTime / totalAssigned) * 100) : 100;

  const buckets: { label: string; min: number; max: number | null; stale: boolean }[] = [
    { label: "0–7 days", min: 0, max: 7, stale: false },
    { label: "8–15 days", min: 8, max: 15, stale: false },
    { label: "16–30 days", min: 16, max: 30, stale: false },
    { label: "31–60 days", min: 31, max: 60, stale: true },
    { label: "60+ days", min: 61, max: null, stale: true },
  ];
  const agingCounts = buckets.map(() => ({ count: 0, value: 0 }));
  for (const lead of leadsForAging) {
    const ageDays = Math.floor(
      (now.getTime() - new Date(lead.updatedAt).getTime()) / MS_DAY,
    );
    const idx = buckets.findIndex((b) => {
      if (b.max === null) return ageDays >= b.min;
      return ageDays >= b.min && ageDays <= b.max;
    });
    if (idx >= 0) {
      agingCounts[idx]!.count++;
      const rev = parseFloat(String(lead.annualRevenueDisplay ?? "0").replace(/[^\d.]/g, "")) || 0;
      agingCounts[idx]!.value += rev;
    }
  }
  const totalAgingLeads = agingCounts.reduce((s, b) => s + b.count, 0) || 1;
  const leadAging: LeadAgingBucket[] = buckets.map((b, i) => ({
    label: b.label,
    minDays: b.min,
    maxDays: b.max,
    leadCount: agingCounts[i]!.count,
    valueDisplay: formatINRLong(agingCounts[i]!.value),
    pct: Math.round((agingCounts[i]!.count / totalAgingLeads) * 100),
    stale: b.stale && agingCounts[i]!.count > 0,
  }));

  const overdueFollowUps = followUpRows.filter(
    (f) => f.followUpAt && new Date(f.followUpAt) < now && !f.outcome,
  ).length;

  const slaBreaches: SlaBreachCard[] = [
    {
      id: "leads-24h",
      title: "Leads not contacted (24h)",
      count: leadsNoContact24h,
      priorCount: leadsNoContact24hPrior,
      severity: severityForCount(leadsNoContact24h, [3, 8, 15]),
      trend: trendFrom(leadsNoContact24h, leadsNoContact24hPrior),
    },
    {
      id: "follow-up-overdue",
      title: "Overdue follow-ups",
      count: overdueFollowUps,
      priorCount: Math.max(0, overdueFollowUps - 2),
      severity: severityForCount(overdueFollowUps, [5, 12, 25]),
      trend: "up",
    },
    {
      id: "quotes-pending",
      title: "Quotes pending approval",
      count: quotesPending,
      priorCount: quotesPendingPrior,
      severity: severityForCount(quotesPending, [2, 5, 10]),
      trend: trendFrom(quotesPending, quotesPendingPrior),
    },
    {
      id: "opp-inactive",
      title: "Opportunities without activity (10d+)",
      count: oppsStale10,
      priorCount: oppsStale10Prior,
      severity: severityForCount(oppsStale10, [5, 12, 20]),
      trend: trendFrom(oppsStale10, oppsStale10Prior),
    },
    {
      id: "tasks-overdue",
      title: "Tasks overdue",
      count: input.overdueTasks,
      priorCount: Math.max(0, input.overdueTasks - 1),
      severity: severityForCount(input.overdueTasks, [3, 8, 15]),
      trend: "flat",
    },
  ];

  const approvalCenter = {
    pending: approvalPending,
    approved: approvalApproved,
    rejected: approvalRejected,
    rows: approvalRows.map((a) => ({
      id: a.id,
      requestType: "Quote approval",
      title: `Quote ${a.quote.quoteNumber}`,
      requestedBy: a.requestedByName ?? "—",
      amountDisplay: formatCompactCurrency(
        Number(a.quote.grandTotal ?? 0),
        a.quote.currency ?? "INR",
      ),
      createdIso: a.requestedAt.toISOString(),
      status: a.status as "Pending" | "Approved" | "Rejected",
    })),
  };

  const teamHeatmap: HeatmapCell[] = filteredMembers.map((m) => {
    const lb = leaderboard.find((l) => l.userId === m.userId);
    const userName =
      `${m.user.firstName ?? ""} ${m.user.lastName ?? ""}`.trim() || m.user.email;
    return {
      userId: m.userId,
      userName,
      calls: callsMap.get(m.userId) ?? 0,
      emails: emailsMap.get(m.userId) ?? 0,
      meetings: meetingsMap.get(m.userId) ?? 0,
      tasks: tasksDoneMap.get(m.userId) ?? 0,
      deals: lb?.dealsWon ?? 0,
      revenue: parseFloat((lb?.revenueDisplay ?? "0").replace(/[^\d.]/g, "")) || 0,
    };
  });

  const leadsMap = mapGroup(openLeadsByOwner as never, "ownerId");
  const oppsMap = mapGroup(openOppsByOwner as never, "ownerId");
  const tasksMap = mapGroup(openTasksByOwner as never, "assignedToUserId");
  const fuMap = mapGroup(followUpsByOwner as never, "ownerId");

  const workload = filteredMembers.map((m) => {
    const userName =
      `${m.user.firstName ?? ""} ${m.user.lastName ?? ""}`.trim() || m.user.email;
    return {
      userId: m.userId,
      userName,
      assignedLeads: leadsMap.get(m.userId) ?? 0,
      assignedOpportunities: oppsMap.get(m.userId) ?? 0,
      assignedTasks: tasksMap.get(m.userId) ?? 0,
      pendingFollowUps: fuMap.get(m.userId) ?? 0,
    };
  });

  const contactedAccountIds = new Set(
    weekActivities.map((a) => a.relatedObjectId).filter(Boolean),
  );
  const renewalSoon = await prisma.qcfOpportunity.count({
    where: {
      orgId,
      deletedAt: null,
      closeDate: { gte: now, lte: new Date(now.getTime() + 30 * MS_DAY) },
    },
  });

  const healthScore = Math.min(
    100,
    Math.round(
      (contactedAccountIds.size / Math.max(accountsAll.length, 1)) * 40 +
        (100 - Math.min(100, (accountsStale30 / Math.max(accountsAll.length, 1)) * 100)) * 0.4 +
        Math.min(meetingWeekCount * 5, 20),
    ),
  );

  const customerEngagement = {
    contactedThisWeek: contactedAccountIds.size,
    withoutActivity30d: accountsStale30,
    upcomingRenewals: renewalSoon,
    customerMeetings: meetingWeekCount,
    openSupportIssues: 0,
    healthScore,
  };

  const productivityDelta = input.teamProductivityScore - input.teamProductivityPrior;
  const executiveAlerts: ExecutiveAlert[] = [];

  if (oppsStale10 > 0) {
    executiveAlerts.push({
      id: "opp-inactive",
      priority: "high",
      tone: "danger",
      message: `${oppsStale10} opportunities inactive for 10+ days`,
      ownerName: null,
      createdIso: now.toISOString(),
    });
  }
  if (input.highValueAtRisk > 0) {
    executiveAlerts.push({
      id: "hv-risk",
      priority: "high",
      tone: "danger",
      message: `${input.highValueAtRisk} high-value deals at risk`,
      ownerName: null,
      createdIso: now.toISOString(),
    });
  }
  if (overdueFollowUps > 0) {
    executiveAlerts.push({
      id: "fu-overdue",
      priority: "medium",
      tone: "warning",
      message: `${overdueFollowUps} overdue follow-ups`,
      ownerName: null,
      createdIso: now.toISOString(),
    });
  }
  if (input.revenueAchievementPct !== null && input.revenueAchievementPct < 70) {
    executiveAlerts.push({
      id: "revenue-pace",
      priority: "medium",
      tone: "warning",
      message: `Revenue target achievement at ${input.revenueAchievementPct}% — below expected pace`,
      ownerName: null,
      createdIso: now.toISOString(),
    });
  }
  if (productivityDelta > 5) {
    executiveAlerts.push({
      id: "prod-up",
      priority: "low",
      tone: "success",
      message: `Team productivity improved by ${productivityDelta}%`,
      ownerName: null,
      createdIso: now.toISOString(),
    });
  }

  return {
    todaySnapshot,
    adoption,
    inactiveUsers,
    followUpCompliance: {
      totalAssigned,
      completedOnTime,
      completedLate,
      overdue,
      missed,
      compliancePct,
    },
    leadAging,
    slaBreaches,
    approvalCenter,
    teamHeatmap,
    workload,
    customerEngagement,
    executiveAlerts,
    filters: ext,
  };
}

export function buildEnhancedInsights(input: {
  leaderboard: LeaderboardRow[];
  usage: UsageRow[];
  channels: { channel: string; leadCount: number }[];
  funnel: { stage: string; count: number; pct: number }[];
  adoption: AdoptionRow[];
  followUpCompliancePct: number;
  slaBreaches: SlaBreachCard[];
  teamProductivityScore: number;
  teamProductivityPrior: number;
  atRiskCount: number;
  largestAtRiskDisplay: string | null;
}): OverviewInsight[] {
  const out: OverviewInsight[] = [];

  const topLb = input.leaderboard[0];
  const bottomLb = input.leaderboard[input.leaderboard.length - 1];
  const topAdopt = input.adoption[0];
  const bottomAdopt = input.adoption[input.adoption.length - 1];
  const topRev = [...input.leaderboard].sort(
    (a, b) =>
      parseFloat(b.revenueDisplay.replace(/[^\d.]/g, "")) -
      parseFloat(a.revenueDisplay.replace(/[^\d.]/g, "")),
  )[0];
  const bestChannel = [...input.channels].sort((a, b) => b.leadCount - a.leadCount)[0];

  if (topLb) {
    out.push({
      id: "most-productive",
      tone: "success",
      title: "Most productive user",
      body: `${topLb.userName} — activity score ${topLb.activityScore}.`,
    });
  }
  if (bottomLb && input.leaderboard.length > 1) {
    out.push({
      id: "least-active",
      tone: "warning",
      title: "Least active user",
      body: `${bottomLb.userName} — lowest activity score in the period.`,
    });
  }
  if (topRev) {
    out.push({
      id: "top-revenue",
      tone: "success",
      title: "Highest revenue generator",
      body: `${topRev.userName} closed ${topRev.revenueDisplay} in revenue.`,
    });
  }
  if (bestChannel && bestChannel.leadCount > 0) {
    out.push({
      id: "best-source",
      tone: "info",
      title: "Best lead source",
      body: `${bestChannel.channel} — ${bestChannel.leadCount} leads.`,
    });
  }
  if (input.funnel.length >= 2) {
    let worst = { from: "", to: "", pct: 0 };
    for (let i = 1; i < input.funnel.length; i++) {
      const prev = input.funnel[i - 1]!.count;
      const cur = input.funnel[i]!.count;
      if (prev > 0) {
        const drop = Math.round((1 - cur / prev) * 100);
        if (drop > worst.pct) worst = { from: input.funnel[i - 1]!.stage, to: input.funnel[i]!.stage, pct: drop };
      }
    }
    if (worst.from) {
      out.push({
        id: "lowest-conversion",
        tone: "warning",
        title: "Lowest conversion stage",
        body: `${worst.pct}% drop from ${worst.from} → ${worst.to}.`,
      });
    }
  }
  if (input.largestAtRiskDisplay) {
    out.push({
      id: "largest-at-risk",
      tone: "danger",
      title: "Largest opportunity at risk",
      body: input.largestAtRiskDisplay,
    });
  }
  const prodDelta = input.teamProductivityScore - input.teamProductivityPrior;
  out.push({
    id: "team-prod-change",
    tone: prodDelta >= 0 ? "success" : "warning",
    title: "Team productivity change",
    body: `${prodDelta >= 0 ? "+" : ""}${prodDelta} pts vs prior period (${input.teamProductivityScore}/100).`,
  });
  out.push({
    id: "follow-up-compliance",
    tone: input.followUpCompliancePct >= 80 ? "success" : "warning",
    title: "Follow-up compliance",
    body: `${input.followUpCompliancePct}% completed on time.`,
  });
  const criticalSla = input.slaBreaches.filter((s) => s.severity === "critical" || s.severity === "high");
  if (criticalSla.length > 0) {
    out.push({
      id: "sla-risk",
      tone: "danger",
      title: "SLA risk trend",
      body: `${criticalSla.length} high-severity SLA breach(es) need attention.`,
    });
  }
  if (topAdopt) {
    out.push({
      id: "top-adoption",
      tone: "info",
      title: "CRM adoption leader",
      body: `${topAdopt.userName} at ${topAdopt.score}% adoption.`,
    });
  }
  if (bottomAdopt && input.adoption.length > 1 && bottomAdopt.score < 50) {
    out.push({
      id: "low-adoption",
      tone: "warning",
      title: "Low CRM adoption",
      body: `${bottomAdopt.userName} at ${bottomAdopt.score}% — coaching recommended.`,
    });
  }
  out.push({
    id: "revenue-forecast",
    tone: "info",
    title: "Revenue forecast",
    body: `Pipeline momentum suggests ${prodDelta >= 0 ? "upward" : "downward"} close rate vs last period.`,
  });

  return out.slice(0, 12);
}

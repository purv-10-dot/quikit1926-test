import { prisma } from "@/lib/db/prisma";
import type {
  SalespersonDetailDto,
  SalespersonHeatmapDay,
  SalespersonFunnelStage,
  SalespersonCallDurationBucket,
} from "@/lib/dashboard/salesperson-detail-types";
import {
  buildDayBuckets,
  endOfDayInTz,
  isoDateInTz,
  addDays,
  startOfDayInTz,
  priorRange,
  type DateRange,
} from "./period";
import { formatINRLong, formatCompactCurrency, formatINR } from "./currency";
import { resolveOwnerScope, spreadOwnerFilter } from "./owner-scope";

function classifyActivity(type: string, code: string | null) {
  const t = `${type} ${code ?? ""}`.toLowerCase();
  if (t.includes("email")) return "email";
  if (t.includes("meeting")) return "meeting";
  if (t.includes("call") || t.includes("phone")) return "call";
  return "other";
}

function summariseAudit(module: string, action: string, after: unknown): string {
  const a = action.toLowerCase();
  const m = module;
  if (after && typeof after === "object") {
    const obj = after as Record<string, unknown>;
    const name = obj["name"] ?? obj["subject"] ?? obj["quoteNumber"] ?? obj["title"] ?? null;
    if (name) return `${a} ${m}: ${name}`;
  }
  return `${a} ${m}`;
}

// Build 90-day activity heatmap
async function buildHeatmap(
  orgId: string,
  activityFilter: Record<string, unknown>,
  tz: string,
): Promise<SalespersonHeatmapDay[]> {
  const now = new Date();
  const heatmapFrom = startOfDayInTz(addDays(now, -89), tz);
  const heatmapTo = endOfDayInTz(now, tz);

  const rows = await prisma.qcfActivity.findMany({
    where: {
      orgId,
      occurredAt: { gte: heatmapFrom, lte: heatmapTo },
      ...activityFilter,
    },
    select: { occurredAt: true },
  });

  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r.occurredAt) continue;
    const key = isoDateInTz(r.occurredAt, tz);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const result: SalespersonHeatmapDay[] = [];
  let cursor = heatmapFrom;
  while (cursor <= heatmapTo) {
    const key = isoDateInTz(cursor, tz);
    result.push({ date: key, count: counts.get(key) ?? 0 });
    cursor = addDays(cursor, 1);
  }
  return result;
}

// Build pipeline funnel from lead stage distribution
function buildFunnel(
  stageGroups: { stage: string | null; _count: number }[],
): SalespersonFunnelStage[] {
  const FUNNEL_ORDER = ["New", "Contacted", "Qualified", "Negotiation", "Closed Won", "Closed Lost"];
  const total = stageGroups.reduce((s, g) => s + g._count, 0);
  if (total === 0) return [];

  return FUNNEL_ORDER.flatMap((stage) => {
    const match = stageGroups.find((g) => (g.stage ?? "Unknown") === stage);
    if (!match) return [];
    return [{ stage, count: match._count, pct: Math.round((match._count / total) * 100) }];
  });
}

// Build call duration histogram buckets
function buildCallDurationBuckets(
  calls: { durationSec: number | null }[],
): SalespersonCallDurationBucket[] {
  const buckets = [
    { label: "<1 min", min: 0, max: 60 },
    { label: "1–3 min", min: 60, max: 180 },
    { label: "3–5 min", min: 180, max: 300 },
    { label: "5–10 min", min: 300, max: 600 },
    { label: "10+ min", min: 600, max: Infinity },
  ];
  return buckets.map((b) => ({
    label: b.label,
    count: calls.filter((c) => {
      const d = c.durationSec ?? 0;
      return d >= b.min && d < b.max && d > 0;
    }).length,
  }));
}

// Compute avg response time: for each lead, find first activity occurredAt after lead.createdAt
async function computeAvgResponseTime(
  orgId: string,
  leadIds: string[],
  leadCreatedMap: Map<string, Date>,
): Promise<number | null> {
  if (leadIds.length === 0) return null;

  const firstActivities = await prisma.qcfActivity.findMany({
    where: { orgId, leadId: { in: leadIds } },
    orderBy: { occurredAt: "asc" },
    select: { leadId: true, occurredAt: true },
  });

  const firstByLead = new Map<string, Date>();
  for (const a of firstActivities) {
    if (!a.leadId || !a.occurredAt) continue;
    if (!firstByLead.has(a.leadId)) {
      firstByLead.set(a.leadId, a.occurredAt);
    }
  }

  const diffs: number[] = [];
  for (const [leadId, createdAt] of leadCreatedMap) {
    const firstAct = firstByLead.get(leadId);
    if (!firstAct) continue;
    const diffMin = (firstAct.getTime() - createdAt.getTime()) / 60000;
    if (diffMin >= 0 && diffMin <= 60 * 24 * 7) {
      diffs.push(diffMin);
    }
  }

  if (diffs.length === 0) return null;
  return Math.round(diffs.reduce((s, d) => s + d, 0) / diffs.length);
}

export async function getSalespersonDetail(
  orgId: string,
  userId: string,
  range: DateRange,
): Promise<SalespersonDetailDto | null> {
  const member = await prisma.orgMember.findFirst({
    where: { orgId: orgId, userId },
    include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
  });
  if (!member) return null;

  const u = member.user;
  const userName =
    u
      ? [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email || "Unknown"
      : "Unknown";
  const userEmail = u?.email ?? null;

  const ownerScope = await resolveOwnerScope(userId);
  const leadFilter = spreadOwnerFilter(ownerScope);
  const activityFilter = spreadOwnerFilter(ownerScope);
  const callFilter = spreadOwnerFilter(ownerScope, { idKey: "agentUserId", nameKey: "ownerName" });
  const taskFilter = spreadOwnerFilter(ownerScope, { idKey: "assignedToUserId", nameKey: null });

  const rangeWhere = { gte: range.from, lte: range.to };
  const prior = priorRange(range);
  const priorWhere = { gte: prior.from, lte: prior.to };
  const now = new Date();

  const baseLeadWhere = {
    orgId,
    deletedAt: null,
    createdAt: rangeWhere,
    ...leadFilter,
  };

  // ── All queries in parallel ────────────────────────────────────────────────
  const [
    leadsCreated,
    allActivityRows,
    allCallRows,
    allTaskRows,
    allNoteRows,
    dealsWon,
    dealsLost,
    tasksCompleted,
    totalTasks,
    quotesWon,
    quotesLost,
    recentLeadRows,
    stageGroups,
    sourceGroups,
    convertedLeads,
    allQuotes,
    allOpportunities,
    auditRows,
    lastLoginEvent,
    lastActivityEvent,
    // New queries
    wonOpportunitiesRevenue,
    totalPipelineAgg,
    overdueTasksCount,
    // Previous period for deltas
    prevLeadsCreated,
    prevConvertedLeads,
    prevCallRows,
    prevDealsWon,
    prevWonRevenue,
    prevEmailCount,
    prevMeetingCount,
    prevTasksCompleted,
  ] = await Promise.all([
    // Total leads created
    prisma.qcfLead.count({ where: baseLeadWhere }),

    // All activities with lead info
    prisma.qcfActivity.findMany({
      where: { orgId, occurredAt: rangeWhere, ...activityFilter },
      orderBy: { occurredAt: "desc" },
      take: 150,
      select: {
        id: true, type: true, activityCode: true, subject: true,
        outcome: true, detailNotes: true, leadId: true, occurredAt: true,
        lead: { select: { name: true, company: true } },
      },
    }),

    // All call logs with lead info
    prisma.qcfCallLog.findMany({
      where: { orgId, createdAt: rangeWhere, ...callFilter },
      orderBy: { createdAt: "desc" },
      take: 150,
      select: {
        id: true, leadId: true, direction: true, status: true,
        durationSec: true, disposition: true, notes: true, startTime: true, createdAt: true,
        lead: { select: { name: true, company: true } },
      },
    }),

    // All tasks with lead info
    prisma.qcfTask.findMany({
      where: { orgId, createdAt: rangeWhere, ...taskFilter },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true, subject: true, taskType: true, priority: true, status: true,
        dueDate: true, leadId: true, createdAt: true,
        lead: { select: { name: true, company: true } },
      },
    }),

    // Notes by this user
    prisma.qcfNote.findMany({
      where: { orgId, createdByUserId: userId, createdAt: rangeWhere },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true, content: true, leadId: true, createdAt: true,
        lead: { select: { name: true, company: true } },
      },
    }),

    // Deals won
    prisma.qcfOpportunity.count({
      where: { orgId, deletedAt: null, stage: "ClosedWon", updatedAt: rangeWhere, ownerId: userId },
    }),

    // Deals lost
    prisma.qcfOpportunity.count({
      where: { orgId, deletedAt: null, stage: "ClosedLost", updatedAt: rangeWhere, ownerId: userId },
    }),

    // Tasks completed
    prisma.qcfTask.count({
      where: { orgId, status: "Completed", updatedAt: rangeWhere, ...taskFilter },
    }),

    // Total tasks (all statuses)
    prisma.qcfTask.count({
      where: { orgId, createdAt: rangeWhere, ...taskFilter },
    }),

    // Quotes won
    prisma.qcfQuote.count({
      where: { orgId, ownerId: userId, status: "Won", createdAt: rangeWhere },
    }),

    // Quotes lost
    prisma.qcfQuote.count({
      where: { orgId, ownerId: userId, status: "Lost", createdAt: rangeWhere },
    }),

    // Recent leads (last 20)
    prisma.qcfLead.findMany({
      where: baseLeadWhere,
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true, name: true, company: true, stage: true,
        status: true, source: true, createdAt: true,
      },
    }),

    // Stage breakdown (all time for this rep)
    prisma.qcfLead.groupBy({
      by: ["stage"],
      where: { orgId, deletedAt: null, ...leadFilter },
      _count: true,
      orderBy: { _count: { stage: "desc" } },
    }),

    // Source breakdown
    prisma.qcfLead.groupBy({
      by: ["source"],
      where: { orgId, deletedAt: null, ...leadFilter },
      _count: true,
      orderBy: { _count: { source: "desc" } },
      take: 6,
    }),

    // Converted leads in period
    prisma.qcfLead.findMany({
      where: {
        orgId,
        deletedAt: null,
        convertedAt: rangeWhere,
        ...leadFilter,
      },
      orderBy: { convertedAt: "desc" },
      take: 50,
      select: {
        id: true, name: true, company: true, convertedAt: true,
      },
    }),

    // Quotes created by this user in period
    prisma.qcfQuote.findMany({
      where: { orgId, ownerId: userId, createdAt: rangeWhere },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true, quoteNumber: true, status: true,
        grandTotal: true, currency: true, accountId: true, createdAt: true,
      },
    }),

    // Opportunities created/updated by this user in period
    prisma.qcfOpportunity.findMany({
      where: { orgId, deletedAt: null, ownerId: userId, updatedAt: rangeWhere },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true, name: true, stage: true, amount: true, currency: true,
        closeDate: true, createdAt: true, updatedAt: true,
        account: { select: { name: true } },
      },
    }),

    // Audit log — all actions by this user
    prisma.qcfAuditLog.findMany({
      where: { orgId, userId, createdAt: rangeWhere },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true, module: true, action: true,
        resourceId: true, after: true, createdAt: true,
      },
    }),

    // Last login session event
    prisma.sessionEvent.findFirst({
      where: { orgId: orgId, userId, appSlug: "quikcrm", event: "login" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),

    // Last CRM activity by this user (all time)
    prisma.qcfActivity.findFirst({
      where: { orgId, ...activityFilter },
      orderBy: { occurredAt: "desc" },
      select: { occurredAt: true },
    }),

    // ── New queries ──────────────────────────────────────────────────────────

    // Revenue from won deals in period
    prisma.qcfOpportunity.aggregate({
      where: { orgId, deletedAt: null, stage: "ClosedWon", updatedAt: rangeWhere, ownerId: userId },
      _sum: { amount: true },
    }),

    // Total pipeline value (all open opportunities, all time)
    prisma.qcfOpportunity.aggregate({
      where: {
        orgId,
        deletedAt: null,
        ownerId: userId,
        stage: { notIn: ["ClosedWon", "ClosedLost"] },
      },
      _sum: { amount: true },
    }),

    // Overdue tasks (due before now, not completed/cancelled)
    prisma.qcfTask.count({
      where: {
        orgId,
        ...taskFilter,
        dueDate: { lt: now },
        status: { notIn: ["Completed", "Cancelled"] },
      },
    }),

    // ── Previous period queries for deltas ───────────────────────────────────
    prisma.qcfLead.count({
      where: { orgId, deletedAt: null, createdAt: priorWhere, ...leadFilter },
    }),
    prisma.qcfLead.count({
      where: { orgId, deletedAt: null, convertedAt: priorWhere, ...leadFilter },
    }),
    prisma.qcfCallLog.count({
      where: { orgId, createdAt: priorWhere, ...callFilter },
    }),
    prisma.qcfOpportunity.count({
      where: { orgId, deletedAt: null, stage: "ClosedWon", updatedAt: priorWhere, ownerId: userId },
    }),
    prisma.qcfOpportunity.aggregate({
      where: { orgId, deletedAt: null, stage: "ClosedWon", updatedAt: priorWhere, ownerId: userId },
      _sum: { amount: true },
    }),
    prisma.qcfActivity.count({
      where: { orgId, occurredAt: priorWhere, type: { contains: "email", mode: "insensitive" }, ...activityFilter },
    }),
    prisma.qcfActivity.count({
      where: { orgId, occurredAt: priorWhere, type: { contains: "meeting", mode: "insensitive" }, ...activityFilter },
    }),
    prisma.qcfTask.count({
      where: { orgId, status: "Completed", updatedAt: priorWhere, ...taskFilter },
    }),
  ]);

  // Classify activities for KPI counts
  let emails = 0, meetings = 0, calls = 0;
  for (const a of allActivityRows) {
    const kind = classifyActivity(a.type, a.activityCode);
    if (kind === "email") emails++;
    else if (kind === "meeting") meetings++;
    else if (kind === "call") calls++;
  }
  const totalCalls = allCallRows.length + calls;

  // Connected calls
  const callsConnected = allCallRows.filter((c) => {
    const s = (c.status ?? "").toLowerCase();
    const d = (c.disposition ?? "").toLowerCase();
    return (
      s === "completed" ||
      s === "answered" ||
      (c.durationSec !== null && c.durationSec > 0 && !d.includes("no-answer") && !d.includes("busy"))
    );
  }).length;

  const activityScore =
    leadsCreated * 5 +
    convertedLeads.length * 15 +
    totalCalls * 3 +
    emails * 2 +
    meetings * 4 +
    dealsWon * 10 +
    allQuotes.length * 5;

  // Revenue calculations
  const revenueWon = Number(wonOpportunitiesRevenue._sum.amount ?? 0);
  const totalPipelineValue = Number(totalPipelineAgg._sum.amount ?? 0);
  const avgDealSize = dealsWon > 0 ? revenueWon / dealsWon : 0;
  const prevRevenueWon = Number(prevWonRevenue._sum.amount ?? 0);

  // ── Daily trend (last 14 buckets) ─────────────────────────────────────────
  const buckets = buildDayBuckets(range).slice(-14);
  const activityTrend = await Promise.all(
    buckets.map(async (b) => {
      const from = new Date(b.iso);
      const to = endOfDayInTz(from, range.tz);
      const [leads, activities] = await Promise.all([
        prisma.qcfLead.count({
          where: { orgId, deletedAt: null, createdAt: { gte: from, lte: to }, ...leadFilter },
        }),
        prisma.qcfActivity.count({
          where: { orgId, occurredAt: { gte: from, lte: to }, ...activityFilter },
        }),
      ]);
      return { label: b.label, leads, activities };
    }),
  );

  // ── Sparklines ───────────────────────────────────────────────────────────
  const dayLabel = (iso: string | Date) => {
    const d = new Date(iso instanceof Date ? iso : iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const bucketLabels = activityTrend.map((b) => b.label);

  function toSparkline(isoList: string[]): number[] {
    const map = new Map<string, number>();
    for (const iso of isoList) {
      const lbl = dayLabel(iso);
      map.set(lbl, (map.get(lbl) ?? 0) + 1);
    }
    return bucketLabels.map((lbl) => map.get(lbl) ?? 0);
  }

  const emailIsos = allActivityRows
    .filter((a) => classifyActivity(a.type, a.activityCode) === "email")
    .map((a) => a.occurredAt?.toISOString() ?? "");
  const meetingIsos = allActivityRows
    .filter((a) => classifyActivity(a.type, a.activityCode) === "meeting")
    .map((a) => a.occurredAt?.toISOString() ?? "");

  const sparklines = {
    leads: bucketLabels.map((_, i) => activityTrend[i]?.leads ?? 0),
    conversions: toSparkline(convertedLeads.map((l) => l.convertedAt!.toISOString())),
    opportunities: toSparkline(allOpportunities.map((o) => o.updatedAt.toISOString())),
    calls: toSparkline(allCallRows.map((c) => (c.startTime ?? c.createdAt).toISOString())),
    emails: toSparkline(emailIsos),
    meetings: toSparkline(meetingIsos),
    quotes: toSparkline(allQuotes.map((q) => q.createdAt.toISOString())),
    tasks: toSparkline(allTaskRows.map((t) => t.createdAt.toISOString())),
    notes: toSparkline(allNoteRows.map((n) => n.createdAt.toISOString())),
  };

  // ── Heatmap (90 days) ──────────────────────────────────────────────────────
  const heatmap = await buildHeatmap(orgId, activityFilter, range.tz);

  // ── Funnel ─────────────────────────────────────────────────────────────────
  const funnel = buildFunnel(stageGroups);

  // ── Call duration histogram ────────────────────────────────────────────────
  const callDurationBuckets = buildCallDurationBuckets(allCallRows);

  // ── Avg response time ──────────────────────────────────────────────────────
  const leadCreatedMap = new Map(
    recentLeadRows.map((l) => [l.id, l.createdAt]),
  );
  const avgResponseTimeMins = await computeAvgResponseTime(
    orgId,
    recentLeadRows.map((l) => l.id),
    leadCreatedMap,
  );

  return {
    userId,
    userName,
    userEmail,
    rank: 0,
    isTop: false,
    lastLoginIso: lastLoginEvent?.createdAt?.toISOString() ?? null,
    lastActivityIso: lastActivityEvent?.occurredAt?.toISOString() ?? null,
    kpis: {
      leadsCreated,
      leadsConverted: convertedLeads.length,
      calls: totalCalls,
      callsConnected,
      emails,
      meetings,
      dealsWon,
      dealsLost,
      quotesCreated: allQuotes.length,
      quotesWon,
      quotesLost,
      opportunitiesCreated: allOpportunities.length,
      tasksCompleted,
      totalTasks,
      notesAdded: allNoteRows.length,
      activityScore,
      revenueDisplay: formatINRLong(0),
      revenueWon,
      revenueWonDisplay: formatINR(revenueWon),
      avgDealSizeDisplay: dealsWon > 0 ? formatINR(avgDealSize) : "—",
      totalPipelineValue,
      totalPipelineDisplay: formatINR(totalPipelineValue),
      avgResponseTimeMins,
      overdueTasksCount,
    },
    prevKpis: {
      leadsCreated: prevLeadsCreated,
      leadsConverted: prevConvertedLeads,
      calls: prevCallRows,
      dealsWon: prevDealsWon,
      revenueWon: prevRevenueWon,
      emails: prevEmailCount,
      meetings: prevMeetingCount,
      tasksCompleted: prevTasksCompleted,
    },
    activityTrend,
    sparklines,
    heatmap,
    funnel,
    callDurationBuckets,

    recentLeads: recentLeadRows.map((l) => ({
      id: l.id,
      name: l.name,
      company: l.company ?? "—",
      stage: l.stage ?? "—",
      status: l.status ?? "—",
      source: l.source,
      createdAtIso: l.createdAt.toISOString(),
    })),

    activities: allActivityRows.map((a) => ({
      id: a.id,
      type: a.type,
      subject: a.subject ?? a.type,
      outcome: a.outcome,
      detailNotes: a.detailNotes,
      leadId: a.leadId,
      leadName: a.lead?.name ?? null,
      leadCompany: a.lead?.company ?? null,
      occurredAtIso: a.occurredAt?.toISOString() ?? new Date().toISOString(),
    })),

    calls: allCallRows.map((c) => ({
      id: c.id,
      leadId: c.leadId,
      leadName: c.lead?.name ?? null,
      leadCompany: c.lead?.company ?? null,
      direction: c.direction,
      status: c.status,
      durationSec: c.durationSec,
      disposition: c.disposition,
      notes: c.notes,
      startTimeIso: (c.startTime ?? c.createdAt).toISOString(),
    })),

    tasks: allTaskRows.map((t) => ({
      id: t.id,
      subject: t.subject,
      taskType: t.taskType,
      priority: t.priority,
      status: t.status,
      dueDate: t.dueDate?.toISOString() ?? null,
      leadId: t.leadId,
      leadName: t.lead?.name ?? null,
      leadCompany: t.lead?.company ?? null,
      createdAtIso: t.createdAt.toISOString(),
      isOverdue:
        t.dueDate !== null &&
        t.dueDate < now &&
        t.status !== "Completed" &&
        t.status !== "Cancelled",
    })),

    notes: allNoteRows.map((n) => ({
      id: n.id,
      content: n.content,
      leadId: n.leadId,
      leadName: n.lead?.name ?? null,
      leadCompany: n.lead?.company ?? null,
      createdAtIso: n.createdAt.toISOString(),
    })),

    conversions: convertedLeads.map((l) => ({
      id: l.id,
      leadName: l.name,
      leadCompany: l.company ?? "—",
      convertedAtIso: l.convertedAt!.toISOString(),
      opportunityName: null,
    })),

    quotes: allQuotes.map((q) => ({
      id: q.id,
      quoteNumber: q.quoteNumber,
      status: q.status,
      grandTotal: formatCompactCurrency(Number(q.grandTotal ?? 0), q.currency ?? "INR"),
      currency: q.currency ?? "INR",
      accountId: q.accountId,
      createdAtIso: q.createdAt.toISOString(),
    })),

    opportunities: allOpportunities.map((o) => ({
      id: o.id,
      name: o.name,
      stage: o.stage,
      amountDisplay: formatCompactCurrency(Number(o.amount ?? 0), o.currency ?? "INR"),
      accountName: o.account?.name ?? null,
      closeDate: o.closeDate?.toISOString() ?? null,
      createdAtIso: o.createdAt.toISOString(),
      updatedAtIso: o.updatedAt.toISOString(),
    })),

    auditLog: auditRows.map((r) => ({
      id: r.id,
      module: r.module,
      action: r.action,
      resourceId: r.resourceId,
      summary: summariseAudit(r.module, r.action, r.after),
      createdAtIso: r.createdAt.toISOString(),
    })),

    stageBreakdown: stageGroups.map((g) => ({
      stage: g.stage ?? "Unknown",
      count: g._count,
    })),

    sourceBreakdown: sourceGroups.map((g) => ({
      source: g.source?.trim() || "Unknown",
      count: g._count,
    })),

    range: { fromIso: range.from.toISOString(), toIso: range.to.toISOString() },
  };
}

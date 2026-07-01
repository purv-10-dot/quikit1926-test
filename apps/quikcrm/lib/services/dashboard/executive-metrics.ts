/**
 * Executive dashboard metrics — period-bound counts, "my work today", wins.
 */

import type { CrmOpportunityStage, CrmTaskStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  endOfDayInTz,
  startOfDayInTz,
  type DateRange,
} from "./period";
import type { DashboardScope } from "./filters";
import { formatCompactCurrency, formatINRLong } from "./currency";
import type {
  ActivityMix,
  ExecutiveSummary,
  WorkItemRow,
} from "@/lib/dashboard/types";

function classifyActivity(type: string, code: string | null): "call" | "email" | "meeting" | "other" {
  const t = `${type} ${code ?? ""}`.toLowerCase();
  if (t.includes("email")) return "email";
  if (t.includes("meeting")) return "meeting";
  if (t.includes("call") || t.includes("phone")) return "call";
  return "other";
}

export async function buildExecutiveSummary(
  range: DateRange,
  resolvedOwnerId: string | null,
  prior: DateRange,
  scope: DashboardScope,
): Promise<{
  executive: ExecutiveSummary;
  callsPrior: number;
  wonDealsPrior: number;
}> {
  const now = new Date();
  const startOfToday = startOfDayInTz(now, range.tz);
  const endOfToday = endOfDayInTz(now, range.tz);

  // Role-aware RBAC scope (Path B) — same scope used across the dashboard so the
  // Hero KPIs (pipeline / weighted / won / due-today), Recent Wins and My-Work
  // match each role's module visibility. Owner dropdown narrows within scope.
  const oppWhere = { ...scope.recordWhere(resolvedOwnerId), deletedAt: null };
  const taskWhere = scope.taskWhere(resolvedOwnerId);
  const callWhere = scope.callWhere(resolvedOwnerId);

  // Role-scoped activity where (no time clause yet) reused for both the in-range
  // activity-mix scan and the today's-follow-ups query below.
  const activityScopeWhere = scope.activityWhere(resolvedOwnerId);
  const activityBase: Record<string, unknown> = {
    ...activityScopeWhere,
    occurredAt: { gte: range.from, lte: range.to },
  };

  const wonWhere = (from: Date, to: Date) => ({
    ...oppWhere,
    stage: "ClosedWon" as CrmOpportunityStage,
    OR: [
      { lastStageChangeAt: { gte: from, lte: to } },
      { lastStageChangeAt: null, updatedAt: { gte: from, lte: to } },
    ],
  });

  const [
    callsInRange,
    callsPrior,
    activityRows,
    wonOpps,
    wonDealsPrior,
    openOppsForWeight,
    tasksDueTodayCount,
    tasksDueTodayRows,
    followUpRows,
  ] = await Promise.all([
    prisma.crmCallLog.count({
      where: {
        ...callWhere,
        createdAt: { gte: range.from, lte: range.to },
      },
    }),
    prisma.crmCallLog.count({
      where: {
        ...callWhere,
        createdAt: { gte: prior.from, lte: prior.to },
      },
    }),
    prisma.crmActivity.findMany({
      where: activityBase,
      select: { type: true, activityCode: true },
    }),
    prisma.crmOpportunity.findMany({
      where: wonWhere(range.from, range.to),
      select: {
        id: true,
        name: true,
        amount: true,
        currency: true,
        ownerName: true,
        lastStageChangeAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    prisma.crmOpportunity.count({
      where: wonWhere(prior.from, prior.to),
    }),
    prisma.crmOpportunity.findMany({
      where: {
        ...oppWhere,
        stage: { notIn: ["ClosedWon", "ClosedLost"] as CrmOpportunityStage[] },
      },
      select: { amount: true, probability: true, currency: true },
    }),
    prisma.crmTask.count({
      where: {
        ...taskWhere,
        status: { notIn: ["Completed", "Cancelled"] as CrmTaskStatus[] },
        dueDate: { gte: startOfToday, lte: endOfToday },
      },
    }),
    prisma.crmTask.findMany({
      where: {
        ...taskWhere,
        status: { notIn: ["Completed", "Cancelled"] as CrmTaskStatus[] },
        dueDate: { gte: startOfToday, lte: endOfToday },
      },
      orderBy: { dueDate: "asc" },
      take: 6,
      select: { id: true, subject: true, dueDate: true, leadId: true },
    }),
    prisma.crmActivity.findMany({
      where: {
        ...activityScopeWhere,
        followUpAt: { gte: startOfToday, lte: endOfToday },
      },
      orderBy: { followUpAt: "asc" },
      take: 6,
      select: {
        id: true,
        subject: true,
        type: true,
        followUpAt: true,
        leadId: true,
        relatedObjectId: true,
      },
    }),
  ]);

  const activityList = Array.isArray(activityRows) ? activityRows : [];
  const wonList = Array.isArray(wonOpps) ? wonOpps : [];
  const weightList = Array.isArray(openOppsForWeight) ? openOppsForWeight : [];
  const taskList = Array.isArray(tasksDueTodayRows) ? tasksDueTodayRows : [];
  const followList = Array.isArray(followUpRows) ? followUpRows : [];
  const followUpsDueTodayCount = followList.length;

  let emailsInRange = 0;
  let meetingsInRange = 0;
  let otherActivities = 0;
  for (const a of activityList) {
    const kind = classifyActivity(a.type, a.activityCode);
    if (kind === "email") emailsInRange += 1;
    else if (kind === "meeting") meetingsInRange += 1;
    else if (kind === "call") {
      /* call logs counted separately */
    } else otherActivities += 1;
  }

  const activityMix: ActivityMix = {
    calls: callsInRange,
    emails: emailsInRange,
    meetings: meetingsInRange,
    other: otherActivities,
    total: callsInRange + emailsInRange + meetingsInRange + otherActivities,
  };

  let wonInr = 0;
  for (const o of wonList) {
    if ((o.currency ?? "INR") === "INR") wonInr += Number(o.amount ?? 0);
  }
  if (wonInr === 0 && wonList.length > 0) {
    wonInr = wonList.reduce((s, o) => s + Number(o.amount ?? 0), 0);
  }

  let weightedInr = 0;
  for (const o of weightList) {
    const amt = Number(o.amount ?? 0);
    const prob = o.probability ?? 10;
    if ((o.currency ?? "INR") === "INR") weightedInr += amt * (prob / 100);
  }

  const tasksDueTodayItems: WorkItemRow[] = taskList.map((t) => ({
    id: t.id,
    title: t.subject,
    subtitle: "Task due today",
    href: t.leadId ? `/leads/${t.leadId}` : `/tasks`,
    at: t.dueDate?.toISOString() ?? "",
  }));

  const followUpItems: WorkItemRow[] = followList.map((a) => {
    const leadId = a.leadId ?? (a.relatedObjectId || null);
    return {
      id: a.id,
      title: a.subject || a.type,
      subtitle: "Scheduled follow-up",
      href: leadId ? `/leads/${leadId}` : `/activities`,
      at: a.followUpAt?.toISOString() ?? "",
    };
  });

  const recentWins = wonList.slice(0, 5).map((o) => ({
    id: o.id,
    name: o.name,
    amountDisplay: formatCompactCurrency(Number(o.amount ?? 0), o.currency ?? "INR"),
    ownerName: o.ownerName,
    closedAt: (o.lastStageChangeAt ?? o.updatedAt).toISOString(),
  }));

  return {
    executive: {
      callsInRange,
      emailsInRange,
      meetingsInRange,
      activityMix,
      wonDealsCount: wonList.length,
      wonRevenueDisplay: formatINRLong(wonInr),
      weightedPipelineDisplay: formatINRLong(weightedInr),
      tasksDueToday: tasksDueTodayCount,
      followUpsDueToday: followUpsDueTodayCount,
      tasksDueTodayItems,
      followUpItems,
      recentWins,
    },
    callsPrior,
    wonDealsPrior,
  };
}

export type ExecutiveBuildResult = Awaited<ReturnType<typeof buildExecutiveSummary>>;

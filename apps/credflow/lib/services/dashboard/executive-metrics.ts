/**
 * Executive dashboard metrics — period-bound counts, "my work today", wins.
 */

import type { QcfOpportunityStage, QcfTaskStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/types/permission";
import {
  endOfDayInTz,
  startOfDayInTz,
  type DateRange,
} from "./period";
import {
  tenantAgentWhere,
  tenantAssigneeWhere,
  tenantOwnerWhere,
} from "./filters";
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
  user: SessionUser,
  range: DateRange,
  resolvedOwnerId: string | null,
  prior: DateRange,
): Promise<{
  executive: ExecutiveSummary;
  callsPrior: number;
  wonDealsPrior: number;
}> {
  const now = new Date();
  const startOfToday = startOfDayInTz(now, range.tz);
  const endOfToday = endOfDayInTz(now, range.tz);

  const oppWhere = { ...tenantOwnerWhere(user, resolvedOwnerId), deletedAt: null };
  const taskWhere = tenantAssigneeWhere(user, resolvedOwnerId);
  const callWhere = tenantAgentWhere(user, resolvedOwnerId);

  const activityBase: Record<string, unknown> = {
    tenantId: user.tenantId,
    occurredAt: { gte: range.from, lte: range.to },
  };
  if (resolvedOwnerId) activityBase.ownerId = resolvedOwnerId;

  const wonWhere = (from: Date, to: Date) => ({
    ...oppWhere,
    stage: "ClosedWon" as QcfOpportunityStage,
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
    prisma.qcfCallLog.count({
      where: {
        ...callWhere,
        createdAt: { gte: range.from, lte: range.to },
      },
    }),
    prisma.qcfCallLog.count({
      where: {
        ...callWhere,
        createdAt: { gte: prior.from, lte: prior.to },
      },
    }),
    prisma.qcfActivity.findMany({
      where: activityBase,
      select: { type: true, activityCode: true },
    }),
    prisma.qcfOpportunity.findMany({
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
    prisma.qcfOpportunity.count({
      where: wonWhere(prior.from, prior.to),
    }),
    prisma.qcfOpportunity.findMany({
      where: {
        ...oppWhere,
        stage: { notIn: ["ClosedWon", "ClosedLost"] as QcfOpportunityStage[] },
      },
      select: { amount: true, probability: true, currency: true },
    }),
    prisma.qcfTask.count({
      where: {
        ...taskWhere,
        status: { notIn: ["Completed", "Cancelled"] as QcfTaskStatus[] },
        dueDate: { gte: startOfToday, lte: endOfToday },
      },
    }),
    prisma.qcfTask.findMany({
      where: {
        ...taskWhere,
        status: { notIn: ["Completed", "Cancelled"] as QcfTaskStatus[] },
        dueDate: { gte: startOfToday, lte: endOfToday },
      },
      orderBy: { dueDate: "asc" },
      take: 6,
      select: { id: true, subject: true, dueDate: true, leadId: true },
    }),
    prisma.qcfActivity.findMany({
      where: {
        tenantId: user.tenantId,
        followUpAt: { gte: startOfToday, lte: endOfToday },
        ...(resolvedOwnerId ? { ownerId: resolvedOwnerId } : {}),
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

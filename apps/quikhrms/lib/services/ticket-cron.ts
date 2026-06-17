import { prisma } from "@/lib/prisma";
import {
  notifyTicketAutoClosed,
  notifyTicketSlaBreach,
} from "@/lib/services/ticket-notifications";
import { whereEmployeeHasAnyRole } from "@/lib/rbac/queries";

const CLOSED_STATUSES = ["Resolved", "Closed", "Cancelled"] as const;

const ESCALATION_CHAIN: Record<number, string[]> = {
  1: ["admin"],
  2: ["admin"],
  3: ["admin"],
};

async function getEscalationRecipients(orgId: string, level: number): Promise<string[]> {
  const cumulative = new Set<string>();
  for (let l = 1; l <= level; l++) {
    for (const code of ESCALATION_CHAIN[l] ?? []) cumulative.add(code);
  }
  if (cumulative.size === 0) return [];
  const employees = await prisma.employee.findMany({
    where: { orgId, deletedAt: null, ...whereEmployeeHasAnyRole([...cumulative]) },
    select: { id: true },
  });
  return employees.map((e) => e.id);
}

function hoursOverdue(due: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - due.getTime()) / (60 * 60 * 1000)));
}

function nextEscalationLevel(current: number, hoursSinceBreach: number): number {
  if (hoursSinceBreach >= 48) return 3;
  if (hoursSinceBreach >= 24) return 2;
  return Math.max(1, current);
}

// ─── Sweep #1: Auto-close resolved tickets ──────────────

export interface AutoCloseResult {
  processedCategories: number;
  totalClosed: number;
  perCategory: Array<{ orgId: string; categoryId: string; closed: number }>;
}

export async function runAutoCloseSweep(): Promise<AutoCloseResult> {
  const categories = await prisma.ticketCategory.findMany({
    where: { deletedAt: null, autoCloseAfterDays: { gt: 0 } },
    select: { id: true, orgId: true, autoCloseAfterDays: true },
  });

  const now = new Date();
  const perCategory: AutoCloseResult["perCategory"] = [];
  let totalClosed = 0;

  for (const cat of categories) {
    const cutoff = new Date(now.getTime() - cat.autoCloseAfterDays * 24 * 60 * 60 * 1000);
    const eligible = await prisma.ticket.findMany({
      where: {
        orgId: cat.orgId,
        categoryId: cat.id,
        status: "Resolved",
        resolvedAt: { lte: cutoff },
        deletedAt: null,
      },
      select: { id: true, ticketNo: true, title: true, status: true, raisedById: true, assignedToId: true },
    });

    if (eligible.length === 0) {
      perCategory.push({ orgId: cat.orgId, categoryId: cat.id, closed: 0 });
      continue;
    }

    const ids = eligible.map((t) => t.id);
    await prisma.$transaction(async (tx) => {
      await tx.ticket.updateMany({
        where: { id: { in: ids } },
        data: { status: "Closed", closedAt: now, updatedBy: "system:cron" },
      });
      await tx.ticketActivity.createMany({
        data: eligible.map((t) => ({
          orgId: cat.orgId,
          ticketId: t.id,
          actorId: null,
          isSystem: true,
          action: "AutoClosed",
          fromVal: "Resolved",
          toVal: "Closed",
          meta: { reason: `Auto-closed after ${cat.autoCloseAfterDays} days in Resolved` },
        })),
      });
    });

    for (const t of eligible) {
      await notifyTicketAutoClosed(
        cat.orgId,
        { id: t.id, ticketNo: t.ticketNo, title: t.title, raisedById: t.raisedById, assignedToId: t.assignedToId },
        cat.autoCloseAfterDays,
      );
    }

    totalClosed += eligible.length;
    perCategory.push({ orgId: cat.orgId, categoryId: cat.id, closed: eligible.length });
  }

  return { processedCategories: categories.length, totalClosed, perCategory };
}

// ─── Sweep #2: SLA breach detection + escalation ────────

export interface SlaBreachResult {
  responseBreaches: number;
  resolveBreaches: number;
  escalations: number;
}

export async function runSlaBreachSweep(): Promise<SlaBreachResult> {
  const now = new Date();
  let responseBreaches = 0;
  let resolveBreaches = 0;
  let escalations = 0;

  const responseCandidates = await prisma.ticket.findMany({
    where: {
      deletedAt: null,
      firstResponseAt: null,
      responseBreachedAt: null,
      slaResponseDueAt: { lt: now },
      status: { notIn: [...CLOSED_STATUSES] },
    },
    select: {
      id: true, orgId: true, ticketNo: true, title: true,
      priority: true, raisedById: true, assignedToId: true,
      slaResponseDueAt: true, escalationLevel: true,
    },
  });

  for (const t of responseCandidates) {
    if (!t.slaResponseDueAt) continue;
    await prisma.$transaction(async (tx) => {
      await tx.ticket.update({
        where: { id: t.id },
        data: {
          responseBreachedAt: now,
          escalationLevel: Math.max(t.escalationLevel, 1),
          updatedBy: "system:cron",
        },
      });
      await tx.ticketActivity.create({
        data: {
          orgId: t.orgId, ticketId: t.id, actorId: null, isSystem: true,
          action: "ResponseSlaBreached",
          meta: { hoursOverdue: hoursOverdue(t.slaResponseDueAt!, now) },
        },
      });
    });
    const recipients = await getEscalationRecipients(t.orgId, 1);
    await notifyTicketSlaBreach(
      t.orgId,
      { id: t.id, ticketNo: t.ticketNo, title: t.title, raisedById: t.raisedById, assignedToId: t.assignedToId, priority: t.priority },
      "Response",
      hoursOverdue(t.slaResponseDueAt, now),
      1,
      recipients,
    );
    responseBreaches++;
  }

  const resolveFirstBreaches = await prisma.ticket.findMany({
    where: {
      deletedAt: null,
      resolveBreachedAt: null,
      slaResolveDueAt: { lt: now },
      status: { notIn: [...CLOSED_STATUSES] },
    },
    select: {
      id: true, orgId: true, ticketNo: true, title: true,
      priority: true, raisedById: true, assignedToId: true,
      slaResolveDueAt: true, escalationLevel: true,
    },
  });

  for (const t of resolveFirstBreaches) {
    if (!t.slaResolveDueAt) continue;
    await prisma.$transaction(async (tx) => {
      await tx.ticket.update({
        where: { id: t.id },
        data: {
          resolveBreachedAt: now,
          escalationLevel: Math.max(t.escalationLevel, 1),
          updatedBy: "system:cron",
        },
      });
      await tx.ticketActivity.create({
        data: {
          orgId: t.orgId, ticketId: t.id, actorId: null, isSystem: true,
          action: "ResolveSlaBreached",
          meta: { hoursOverdue: hoursOverdue(t.slaResolveDueAt!, now) },
        },
      });
    });
    const recipients = await getEscalationRecipients(t.orgId, 1);
    await notifyTicketSlaBreach(
      t.orgId,
      { id: t.id, ticketNo: t.ticketNo, title: t.title, raisedById: t.raisedById, assignedToId: t.assignedToId, priority: t.priority },
      "Resolve",
      hoursOverdue(t.slaResolveDueAt, now),
      1,
      recipients,
    );
    resolveBreaches++;
  }

  const ongoingBreaches = await prisma.ticket.findMany({
    where: {
      deletedAt: null,
      resolveBreachedAt: { not: null },
      status: { notIn: [...CLOSED_STATUSES] },
      escalationLevel: { lt: 3 },
    },
    select: {
      id: true, orgId: true, ticketNo: true, title: true,
      priority: true, raisedById: true, assignedToId: true,
      slaResolveDueAt: true, resolveBreachedAt: true, escalationLevel: true,
    },
  });

  for (const t of ongoingBreaches) {
    if (!t.resolveBreachedAt || !t.slaResolveDueAt) continue;
    const hrsSinceBreach = (now.getTime() - t.resolveBreachedAt.getTime()) / (60 * 60 * 1000);
    const newLevel = nextEscalationLevel(t.escalationLevel, hrsSinceBreach);
    if (newLevel <= t.escalationLevel) continue;

    await prisma.$transaction(async (tx) => {
      await tx.ticket.update({
        where: { id: t.id },
        data: { escalationLevel: newLevel, updatedBy: "system:cron" },
      });
      await tx.ticketActivity.create({
        data: {
          orgId: t.orgId, ticketId: t.id, actorId: null, isSystem: true,
          action: "Escalated",
          fromVal: `L${t.escalationLevel}`,
          toVal: `L${newLevel}`,
        },
      });
    });
    const recipients = await getEscalationRecipients(t.orgId, newLevel);
    await notifyTicketSlaBreach(
      t.orgId,
      { id: t.id, ticketNo: t.ticketNo, title: t.title, raisedById: t.raisedById, assignedToId: t.assignedToId, priority: t.priority },
      "Resolve",
      hoursOverdue(t.slaResolveDueAt, now),
      newLevel,
      recipients,
    );
    escalations++;
  }

  return { responseBreaches, resolveBreaches, escalations };
}

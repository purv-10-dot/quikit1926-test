/**
 * Tasks service — server-side helpers shared by the API routes.
 *
 * This is the scoped Phase-2 implementation: everything works against the
 * existing CrmTask columns. Schema-dependent features (description,
 * completedAt/By, cancellationReason, snoozedFromDueDate, parentTaskId,
 * recurrenceRule, sourceCallLogId, "Waiting" status) are tracked in the
 * follow-up PR — see // TODO(integration) markers below and in
 * lib/validators/task.ts.
 */
import type { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/types/permission";
import type {
  AdvancedFilterInput,
  CreateTaskInput,
  ListTasksQuery,
  UpdateTaskInput,
} from "@/lib/validators/task";

export type TaskStatus = "Open" | "InProgress" | "Completed" | "Cancelled";

/**
 * Smart-view → subject/taskType keyword groups.
 *
 * The legacy NestJS service used a regex with `|` (e.g. `intro|cp|call`).
 * Postgres `contains` doesn't accept that, so we expand each keyword into
 * its own `contains` clause and OR them together. Translation is faithful;
 * the matching set is identical, only the dispatch shape differs.
 */
const SMART_VIEW_KEYWORDS: Record<string, { subject?: string[]; taskType?: string[] }> = {
  bd_manager_review: { subject: ["review", "manager"] },
  client_meeting: {
    subject: ["client", "meeting", "appointment"],
    taskType: ["Appointment", "Meeting"],
  },
  intro_call: { subject: ["intro", "cp", "call"] },
  outreach: { subject: ["outreach", "dial", "cold"] },
  follow_up: { subject: ["follow"] },
};

function smartViewWhere(key: string | undefined): Prisma.CrmTaskWhereInput | null {
  if (!key) return null;
  const groups = SMART_VIEW_KEYWORDS[key];
  if (!groups) return null;
  const or: Prisma.CrmTaskWhereInput[] = [];
  for (const word of groups.subject ?? []) {
    or.push({ subject: { contains: word, mode: "insensitive" } });
  }
  for (const word of groups.taskType ?? []) {
    or.push({ taskType: { contains: word, mode: "insensitive" } });
  }
  return or.length ? { OR: or } : null;
}

function duePresetWhere(preset: string | undefined): Prisma.CrmTaskWhereInput | null {
  if (!preset) return null;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  const startOfDayAfter = new Date(startOfToday.getTime() + 2 * 24 * 60 * 60 * 1000);
  // Sunday-anchored week; matches the week-calendar view in TasksExplorer.
  const dayOfWeek = startOfToday.getDay();
  const startOfWeek = new Date(startOfToday.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
  const startOfNextWeek = new Date(startOfWeek.getTime() + 7 * 24 * 60 * 60 * 1000);
  const startOfWeekAfter = new Date(startOfWeek.getTime() + 14 * 24 * 60 * 60 * 1000);

  switch (preset) {
    case "overdue":
      return { dueDate: { lt: startOfToday } };
    case "today":
      return { dueDate: { gte: startOfToday, lt: startOfTomorrow } };
    case "tomorrow":
      return { dueDate: { gte: startOfTomorrow, lt: startOfDayAfter } };
    case "this_week":
      return { dueDate: { gte: startOfWeek, lt: startOfNextWeek } };
    case "next_week":
      return { dueDate: { gte: startOfNextWeek, lt: startOfWeekAfter } };
    case "no_date":
      return { dueDate: null };
    default:
      return null;
  }
}

/**
 * Exposed as `buildTaskListWhere` so the CSV export branch on
 * /api/tasks?format=csv can reuse the same filter logic the JSON branch
 * runs through `listTasks`.
 */
export function buildTaskListWhere(
  user: SessionUser,
  q: ListTasksQuery,
): Prisma.CrmTaskWhereInput {
  return buildListWhere(user, q);
}

function buildListWhere(user: SessionUser, q: ListTasksQuery): Prisma.CrmTaskWhereInput {
  const where: Prisma.CrmTaskWhereInput = { tenantId: user.tenantId };
  const ands: Prisma.CrmTaskWhereInput[] = [];

  if (q.status) where.status = q.status;
  if (q.relatedKind) where.relatedKind = q.relatedKind;
  if (q.relatedObjectId) where.relatedObjectId = q.relatedObjectId;
  if (q.assignedToUserId) where.assignedToUserId = q.assignedToUserId;
  if (q.mine) where.assignedToUserId = user.userId;
  if (q.leadId) {
    ands.push({
      OR: [
        { leadId: q.leadId },
        { relatedKind: "Lead", relatedObjectId: q.leadId },
        // Tolerate the legacy lowercase-"lead" rows the original route wrote.
        { relatedKind: "lead", relatedObjectId: q.leadId },
      ],
    });
  }
  if (q.q) {
    ands.push({
      OR: [
        { subject: { contains: q.q, mode: "insensitive" } },
        { taskType: { contains: q.q, mode: "insensitive" } },
      ],
    });
  }
  const sv = smartViewWhere(q.smartView);
  if (sv) ands.push(sv);
  const due = duePresetWhere(q.duePreset);
  if (due) ands.push(due);
  if (q.assignedContains) {
    ands.push({ assignedToUserId: { contains: q.assignedContains, mode: "insensitive" } });
  }

  if (ands.length === 0) return where;
  return { AND: [where, ...ands] };
}

export async function listTasks(user: SessionUser, q: ListTasksQuery) {
  const where = buildListWhere(user, q);
  const pageSize = q.limit ?? q.pageSize;
  const page = q.limit ? 1 : q.page;
  const skip = (page - 1) * pageSize;
  const [items, total] = await Promise.all([
    prisma.crmTask.findMany({
      where,
      // `id desc` tiebreaker → stable page boundaries when many rows share the same dueDate.
      orderBy: [{ dueDate: "asc" }, { id: "desc" }],
      skip,
      take: pageSize,
    }),
    prisma.crmTask.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return { items, total, page, pageSize, totalPages };
}

export async function getTask(user: SessionUser, id: string) {
  return prisma.crmTask.findFirst({ where: { id, tenantId: user.tenantId } });
}

function leadIdFromRelation(input: {
  leadId?: string | null;
  relatedKind?: string | null;
  relatedObjectId?: string | null;
}): string | null {
  if (input.leadId) return input.leadId;
  const kind = input.relatedKind;
  if (!kind || !input.relatedObjectId) return null;
  if (kind === "Lead" || kind === "lead") return input.relatedObjectId;
  return null;
}

export async function createTask(user: SessionUser, input: CreateTaskInput) {
  const data: Prisma.CrmTaskUncheckedCreateInput = {
    tenantId: user.tenantId,
    subject: input.subject,
    taskType: input.taskType ?? null,
    priority: input.priority ?? "Medium",
    status: input.status ?? "Open",
    dueDate: input.dueDate ? new Date(input.dueDate) : null,
    assignedToUserId: input.assignedToUserId ?? null,
    relatedKind: input.relatedKind ?? null,
    relatedObjectId: input.relatedObjectId ?? null,
    leadId: leadIdFromRelation(input),
  };
  return prisma.crmTask.create({ data });
}

interface UpdateOptions {
  /** Skip the status-change audit. Used by snoozeTask which writes its own row. */
  skipStatusAudit?: boolean;
}

/**
 * Update a task with status-change + reassignment audit rows.
 *
 * Writes a CrmActivity { type: "TaskStatusChange" } when status changes and
 * { type: "TaskReassignment" } when assignedToUserId changes — these surface
 * on the lead unified timeline (`/api/activities` filters by leadId) the
 * same way Call/FollowUp activities do today.
 */
export async function updateTask(
  user: SessionUser,
  id: string,
  patch: UpdateTaskInput,
  options: UpdateOptions = {},
) {
  const existing = await prisma.crmTask.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!existing) {
    const err = new Error("Task not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }

  // Unchecked variant lets us set scalar FKs (leadId) directly without a
  // relation connect — matches how the rest of the CRM updates rows.
  const data: Prisma.CrmTaskUncheckedUpdateInput = {};
  if (patch.subject !== undefined) data.subject = patch.subject;
  if (patch.taskType !== undefined) data.taskType = patch.taskType;
  if (patch.priority !== undefined) data.priority = patch.priority;
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.dueDate !== undefined) {
    data.dueDate = patch.dueDate ? new Date(patch.dueDate) : null;
  }
  if (patch.assignedToUserId !== undefined) data.assignedToUserId = patch.assignedToUserId;
  if (patch.relatedKind !== undefined) data.relatedKind = patch.relatedKind;
  if (patch.relatedObjectId !== undefined) data.relatedObjectId = patch.relatedObjectId;
  if (patch.leadId !== undefined) {
    data.leadId = patch.leadId;
  } else if (patch.relatedKind !== undefined || patch.relatedObjectId !== undefined) {
    const merged = {
      leadId: existing.leadId,
      relatedKind: patch.relatedKind ?? existing.relatedKind,
      relatedObjectId: patch.relatedObjectId ?? existing.relatedObjectId,
    };
    data.leadId = leadIdFromRelation(merged);
  }

  const updated = await prisma.crmTask.update({ where: { id }, data });

  const statusChanged = patch.status !== undefined && patch.status !== existing.status;
  const assigneeChanged =
    patch.assignedToUserId !== undefined &&
    (patch.assignedToUserId ?? null) !== (existing.assignedToUserId ?? null);

  if (statusChanged && !options.skipStatusAudit) {
    await writeStatusChangeActivity(user, updated, existing.status, patch.status as TaskStatus, {
      cancellationReason: patch.cancellationReason ?? null,
    });
  }
  if (assigneeChanged) {
    await writeReassignmentActivity(user, updated, existing.assignedToUserId, updated.assignedToUserId);
  }

  return updated;
}

export async function deleteTask(user: SessionUser, id: string) {
  // Tenant-scoped delete; deleteMany returns count so we can detect the 404.
  const res = await prisma.crmTask.deleteMany({ where: { id, tenantId: user.tenantId } });
  if (res.count === 0) {
    const err = new Error("Task not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }
}

export async function snoozeTask(
  user: SessionUser,
  id: string,
  newDueDate: Date,
): Promise<{ task: Awaited<ReturnType<typeof prisma.crmTask.update>>; previousDueDate: Date | null }> {
  const existing = await prisma.crmTask.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!existing) {
    const err = new Error("Task not found") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }
  const updated = await prisma.crmTask.update({
    where: { id },
    data: { dueDate: newDueDate },
  });

  // Status-change activity shape, repurposed for snooze. Stores the old/new
  // due dates in detailNotes since CrmTask has no snoozedFromDueDate column.
  // TODO(integration): switch to a proper snoozedFromDueDate field once the
  // schema overhaul lands so the modal can show "Snoozed from …" reliably.
  if (existing.relatedKind && existing.relatedObjectId) {
    await prisma.crmActivity.create({
      data: {
        tenantId: user.tenantId,
        type: "TaskSnooze",
        relatedKind: existing.relatedKind,
        relatedObjectId: existing.relatedObjectId,
        leadId: existing.leadId,
        subject: `Task · ${existing.subject}`,
        outcome: "Snoozed",
        ownerName: user.name || user.email,
        occurredAt: new Date(),
        detailNotes: `From: ${existing.dueDate?.toISOString() ?? "no date"}\nTo: ${newDueDate.toISOString()}`,
      },
    });
  }

  return { task: updated, previousDueDate: existing.dueDate };
}

export async function advancedFilter(user: SessionUser, input: AdvancedFilterInput) {
  const where: Prisma.CrmTaskWhereInput = { tenantId: user.tenantId };
  const ands: Prisma.CrmTaskWhereInput[] = [];
  if (input.status?.length) ands.push({ status: { in: input.status } });
  if (input.priority?.length) ands.push({ priority: { in: input.priority } });
  if (input.relatedKind?.length) ands.push({ relatedKind: { in: input.relatedKind } });
  if (input.assignedToUserId?.length) ands.push({ assignedToUserId: { in: input.assignedToUserId } });
  if (input.dueFrom || input.dueTo) {
    const range: Prisma.DateTimeFilter = {};
    if (input.dueFrom) range.gte = new Date(input.dueFrom);
    if (input.dueTo) range.lte = new Date(input.dueTo);
    ands.push({ dueDate: range });
  }
  if (input.q) {
    ands.push({
      OR: [
        { subject: { contains: input.q, mode: "insensitive" } },
        { taskType: { contains: input.q, mode: "insensitive" } },
      ],
    });
  }
  const sv = smartViewWhere(input.smartView);
  if (sv) ands.push(sv);

  const finalWhere: Prisma.CrmTaskWhereInput = ands.length ? { AND: [where, ...ands] } : where;
  const skip = (input.page - 1) * input.pageSize;
  const [items, total] = await Promise.all([
    prisma.crmTask.findMany({
      where: finalWhere,
      orderBy: [{ dueDate: "asc" }, { id: "desc" }],
      skip,
      take: input.pageSize,
    }),
    prisma.crmTask.count({ where: finalWhere }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / input.pageSize));
  return { items, total, page: input.page, pageSize: input.pageSize, totalPages };
}

async function writeStatusChangeActivity(
  user: SessionUser,
  task: { id: string; subject: string; relatedKind: string | null; relatedObjectId: string | null; leadId: string | null },
  prevStatus: TaskStatus,
  nextStatus: TaskStatus,
  meta: { cancellationReason: string | null },
) {
  if (!task.relatedKind || !task.relatedObjectId) return;
  await prisma.crmActivity.create({
    data: {
      tenantId: user.tenantId,
      type: "TaskStatusChange",
      relatedKind: task.relatedKind,
      relatedObjectId: task.relatedObjectId,
      leadId: task.leadId,
      subject: `Task · ${task.subject}`,
      outcome: `${prevStatus} → ${nextStatus}`,
      ownerName: user.name || user.email,
      occurredAt: new Date(),
      detailNotes: meta.cancellationReason ?? null,
    },
  });
}

async function writeReassignmentActivity(
  user: SessionUser,
  task: { id: string; subject: string; relatedKind: string | null; relatedObjectId: string | null; leadId: string | null },
  prevUserId: string | null,
  nextUserId: string | null,
) {
  if (!task.relatedKind || !task.relatedObjectId) return;
  const ids = [prevUserId, nextUserId].filter((v): v is string => !!v);
  const profiles = ids.length
    ? await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, firstName: true, lastName: true, email: true },
      })
    : [];
  const labelFor = (id: string | null) => {
    if (!id) return "Unassigned";
    const p = profiles.find((u) => u.id === id);
    return p ? `${p.firstName} ${p.lastName}`.trim() || p.email : id;
  };
  await prisma.crmActivity.create({
    data: {
      tenantId: user.tenantId,
      type: "TaskReassignment",
      relatedKind: task.relatedKind,
      relatedObjectId: task.relatedObjectId,
      leadId: task.leadId,
      subject: `Task · ${task.subject}`,
      outcome: `${labelFor(prevUserId)} → ${labelFor(nextUserId)}`,
      ownerName: user.name || user.email,
      occurredAt: new Date(),
    },
  });
}

/**
 * Best-effort idempotency check used by the disposition → task hook.
 *
 * CrmTask has no sourceCallLogId column yet, so we approximate by matching
 * on lead + due date + status="Open" + a "Follow up · " subject prefix
 * within a 2-minute window of the call log creation. Two clicks on the
 * same disposition modal save (same followUpAt + same lead) collapse to
 * a single task. TODO(integration): replace with a sourceCallLogId
 * unique constraint after the schema overhaul.
 */
export async function findExistingFollowUpTask(opts: {
  tenantId: string;
  leadId: string;
  dueDate: Date;
  callLogCreatedAt: Date;
}) {
  const windowStart = new Date(opts.callLogCreatedAt.getTime() - 2 * 60 * 1000);
  const windowEnd = new Date(opts.callLogCreatedAt.getTime() + 2 * 60 * 1000);
  return prisma.crmTask.findFirst({
    where: {
      tenantId: opts.tenantId,
      leadId: opts.leadId,
      status: "Open",
      dueDate: opts.dueDate,
      subject: { startsWith: "Follow up · " },
      createdAt: { gte: windowStart, lte: windowEnd },
    },
  });
}

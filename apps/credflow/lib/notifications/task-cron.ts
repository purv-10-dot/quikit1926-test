/**
 * Task notification cron sweeps.
 *
 * Two daily sweeps — both cross-tenant (process every active org's tasks):
 *
 *  Morning sweep (9 AM IST / 3:30 AM UTC)
 *  ┌─────────────────────────────────────────────────────────┐
 *  │ task_due_today    → assignees of tasks due today         │
 *  │ task_due_tomorrow → assignees of tasks due tomorrow      │
 *  │   Deduped per calendar day (re-running the sweep on the  │
 *  │   same day won't double-notify).                         │
 *  └─────────────────────────────────────────────────────────┘
 *
 *  Evening sweep (5 PM IST / 11:30 AM UTC)
 *  ┌─────────────────────────────────────────────────────────┐
 *  │ task_overdue → assignee ONCE per task lifetime           │
 *  │   (never repeats).                                       │
 *  └─────────────────────────────────────────────────────────┘
 *
 * Dedupe is implemented with Prisma's typed JSON path filters on the
 * QcfNotification.metadata column (NOT raw `@>` SQL) so the physical column
 * names always match the generated client — no extra tracking table or schema
 * change required. Morning reminders dedupe per calendar day; overdue dedupes
 * once per task lifetime.
 */

import { prisma } from "@/lib/db/prisma";
import { createNotification } from "@/lib/notifications/service";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MorningSweepResult {
  dueTodayCount: number;
  dueTomorrowCount: number;
  errorCount: number;
}

export interface EveningSweepResult {
  overdueFound: number;
  overdueNotified: number;
  overdueSkipped: number;
  errorCount: number;
}

// ─── Shared date helpers ──────────────────────────────────────────────────────

function buildDayWindow(offsetDays: number): { start: Date; end: Date } {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  base.setDate(base.getDate() + offsetDays);
  const end = new Date(base);
  end.setHours(23, 59, 59, 999);
  return { start: base, end };
}

function friendlyDate(date: Date | null): string {
  if (!date) return "no due date";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ─── Morning sweep ────────────────────────────────────────────────────────────

/**
 * Send "due today" and "due tomorrow" reminders.
 * Safe to call at any time — runs across all tenants simultaneously.
 */
export async function runMorningTaskNotifications(): Promise<MorningSweepResult> {
  const today    = buildDayWindow(0);
  const tomorrow = buildDayWindow(1);

  const [dueToday, dueTomorrow] = await Promise.all([
    prisma.qcfTask.findMany({
      where: {
        status: { notIn: ["Completed", "Cancelled"] },
        dueDate: { gte: today.start, lte: today.end },
        assignedToUserId: { not: null },
      },
      select: {
        id: true,
        orgId: true,
        subject: true,
        priority: true,
        dueDate: true,
        assignedToUserId: true,
      },
    }),
    prisma.qcfTask.findMany({
      where: {
        status: { notIn: ["Completed", "Cancelled"] },
        dueDate: { gte: tomorrow.start, lte: tomorrow.end },
        assignedToUserId: { not: null },
      },
      select: {
        id: true,
        orgId: true,
        subject: true,
        priority: true,
        dueDate: true,
        assignedToUserId: true,
      },
    }),
  ]);

  let errorCount = 0;

  // Dedupe scopes to the calendar day via `since = dayStart`: a notification
  // already sent earlier today is skipped, but tomorrow's sweep starts fresh.
  const dayStart = today.start;

  for (const task of dueToday) {
    try {
      const alreadySent = await hasNotificationBeenSent(
        task.orgId,
        task.assignedToUserId!,
        { type: "task_due_today", taskId: task.id },
        dayStart,
      );
      if (alreadySent) continue;

      await createNotification({
        orgId: task.orgId,
        userId: task.assignedToUserId!,
        type: "lead_stage_changed",  // violet arrow — "deadline" icon
        category: "lead",
        title: "Task due today",
        body: `"${task.subject}" is due today. Don't forget to complete it. Priority: ${task.priority}.`,
        link: `/tasks`,
        skipEmail: false,
        metadata: {
          type: "task_due_today",
          taskId: task.id,
          taskSubject: task.subject,
          dueDate: task.dueDate?.toISOString() ?? null,
          priority: task.priority,
        },
      });
    } catch (err: unknown) {
      errorCount++;
      console.error("[task-cron:morning] due-today notification failed:", task.id, err);
    }
  }

  for (const task of dueTomorrow) {
    try {
      const alreadySent = await hasNotificationBeenSent(
        task.orgId,
        task.assignedToUserId!,
        { type: "task_due_tomorrow", taskId: task.id },
        dayStart,
      );
      if (alreadySent) continue;

      await createNotification({
        orgId: task.orgId,
        userId: task.assignedToUserId!,
        type: "lead_stage_changed",
        category: "lead",
        title: "Task due tomorrow",
        body: `"${task.subject}" is due tomorrow. Plan ahead. Priority: ${task.priority}.`,
        link: `/tasks`,
        skipEmail: false,
        metadata: {
          type: "task_due_tomorrow",
          taskId: task.id,
          taskSubject: task.subject,
          dueDate: task.dueDate?.toISOString() ?? null,
          priority: task.priority,
        },
      });
    } catch (err: unknown) {
      errorCount++;
      console.error("[task-cron:morning] due-tomorrow notification failed:", task.id, err);
    }
  }

  // dueTodayCount / dueTomorrowCount are the count of tasks found due, not the
  // count actually sent (deduped sends are still counted as found).
  return {
    dueTodayCount: dueToday.length,
    dueTomorrowCount: dueTomorrow.length,
    errorCount,
  };
}

// ─── Evening sweep ────────────────────────────────────────────────────────────

/**
 * Send "task overdue" notifications — exactly ONCE per task per assignee.
 *
 * The "notify once" guarantee is implemented via hasNotificationBeenSent(),
 * which checks the QcfNotification.metadata column with Prisma's typed JSON
 * path filters (no `since` → notify once per task lifetime). No extra table or
 * schema change is needed.
 */
export async function runEveningTaskNotifications(): Promise<EveningSweepResult> {
  const today = buildDayWindow(0);

  // Tasks that passed their due date and are still open.
  const overdueTasks = await prisma.qcfTask.findMany({
    where: {
      status: { notIn: ["Completed", "Cancelled"] },
      dueDate: { lt: today.start },               // strictly before today
      assignedToUserId: { not: null },
    },
    select: {
      id: true,
      orgId: true,
      subject: true,
      priority: true,
      dueDate: true,
      assignedToUserId: true,
    },
  });

  let notified = 0;
  let skipped  = 0;
  let errorCount = 0;

  for (const task of overdueTasks) {
    try {
      const alreadySent = await hasNotificationBeenSent(
        task.orgId,
        task.assignedToUserId!,
        { type: "task_overdue", taskId: task.id },
      );

      if (alreadySent) {
        skipped++;
        continue;
      }

      await createNotification({
        orgId: task.orgId,
        userId: task.assignedToUserId!,
        type: "lead_reassigned",   // amber UserCheck — "warning" icon
        category: "lead",
        title: "Task overdue",
        body: `"${task.subject}" was due on ${friendlyDate(task.dueDate)} and is now overdue. Priority: ${task.priority}.`,
        link: `/tasks`,
        skipEmail: false,
        metadata: {
          type: "task_overdue",
          taskId: task.id,
          taskSubject: task.subject,
          dueDate: task.dueDate?.toISOString() ?? null,
          priority: task.priority,
        },
      });

      notified++;
    } catch (err) {
      errorCount++;
      console.error("[task-cron:evening] overdue notification failed:", task.id, err);
    }
  }

  return {
    overdueFound: overdueTasks.length,
    overdueNotified: notified,
    overdueSkipped: skipped,
    errorCount,
  };
}

// ─── "Notify once" guard ──────────────────────────────────────────────────────

/**
 * True when a notification matching `match` (a subset of the JSONB metadata)
 * already exists for this (tenant, user). When `since` is given, only counts
 * notifications created at/after it — used to scope "due today/tomorrow"
 * dedupe to the current calendar day while overdue dedupe stays lifetime-wide.
 *
 * Uses Prisma's typed JSON path filters (not raw SQL) so the physical column
 * names always match the generated client.
 */
async function hasNotificationBeenSent(
  orgId: string,
  userId: string,
  match: Record<string, string>,
  since?: Date,
): Promise<boolean> {
  const count = await prisma.qcfNotification.count({
    where: {
      orgId,
      userId,
      ...(since ? { createdAt: { gte: since } } : {}),
      AND: Object.entries(match).map(([key, value]) => ({
        metadata: { path: [key], equals: value },
      })),
    },
  });
  return count > 0;
}

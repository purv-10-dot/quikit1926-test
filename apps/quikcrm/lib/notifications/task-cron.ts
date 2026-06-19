/**
 * Task notification cron sweeps.
 *
 * Two daily sweeps — both cross-tenant (process every active org's tasks):
 *
 *  Morning sweep (9 AM IST / 3:30 AM UTC)
 *  ┌─────────────────────────────────────────────────────────┐
 *  │ task_due_today    → assignees of tasks due today         │
 *  │ task_due_tomorrow → assignees of tasks due tomorrow      │
 *  └─────────────────────────────────────────────────────────┘
 *
 *  Evening sweep (5 PM IST / 11:30 AM UTC)
 *  ┌─────────────────────────────────────────────────────────┐
 *  │ task_overdue → assignee ONCE per task (never repeats)    │
 *  │   Uses JSONB metadata query to detect prior send.        │
 *  └─────────────────────────────────────────────────────────┘
 *
 * The "notify once" guarantee for overdue tasks is enforced via a
 * PostgreSQL JSONB containment query on the crm_notification table —
 * no extra tracking table or schema change required.
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
    prisma.crmTask.findMany({
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
    prisma.crmTask.findMany({
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

  const todayResults = await Promise.allSettled(
    dueToday.map((task) =>
      createNotification({
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
      }),
    ),
  );

  const tomorrowResults = await Promise.allSettled(
    dueTomorrow.map((task) =>
      createNotification({
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
      }),
    ),
  );

  // Count failures but don't throw — partial success is acceptable.
  for (const r of [...todayResults, ...tomorrowResults]) {
    if (r.status === "rejected") {
      errorCount++;
      console.error("[task-cron:morning] notification failed:", r.reason);
    }
  }

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
 * The "notify once" guarantee is implemented by querying the crm_notification
 * table for existing overdue notifications for each (task, assignee) pair using
 * PostgreSQL's JSONB containment operator (@>). No extra table or schema change
 * is needed.
 */
export async function runEveningTaskNotifications(): Promise<EveningSweepResult> {
  const today = buildDayWindow(0);

  // Tasks that passed their due date and are still open.
  const overdueTasks = await prisma.crmTask.findMany({
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
      const alreadySent = await hasOverdueNotificationBeenSent(
        task.orgId,
        task.assignedToUserId!,
        task.id,
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
 * Returns true when an overdue notification has already been sent for this
 * exact (orgId, userId, taskId) combination.
 *
 * Uses PostgreSQL's JSONB containment operator (@>) on the metadata column so
 * no additional tracking table is required. The query is fast because
 * crm_notification is indexed on (org_id, user_id).
 */
async function hasOverdueNotificationBeenSent(
  orgId: string,
  userId: string,
  taskId: string,
): Promise<boolean> {
  // Prisma raw query — metadata is a jsonb column in app_quikcrm schema.
  // The @> operator checks that the stored JSON contains the given subset.
  const matchJson = JSON.stringify({ type: "task_overdue", taskId });

  const rows = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) AS count
    FROM   app_quikcrm.crm_notification
    WHERE  org_id = ${orgId}
      AND  user_id   = ${userId}
      AND  metadata::jsonb @> ${matchJson}::jsonb
  `;

  return Number(rows[0]?.count ?? 0) > 0;
}

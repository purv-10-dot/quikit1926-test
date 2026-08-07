/**
 * Task notification triggers — immediate events.
 *
 * Fires AFTER the task service completes its DB write and audit logging.
 * Never touches existing lead notifications.
 *
 * ─── Events covered ───────────────────────────────────────────────────────────
 *
 *  notifyTaskAssigned()   — task created with assignee, OR assignee changed.
 *                           Suppressed: self-assignment (actor === new assignee).
 *                           Suppressed: no actual change (same ID before/after).
 *
 *  notifyTaskCompleted()  — task status transitions to "Completed".
 *                           Notifies the creator/assigner (QcfTask.createdByUserId)
 *                           when someone else marks the task done.
 *                           When actor === creator (they completed their own task),
 *                           notification is suppressed (they already know).
 *
 * ─── Daily scheduler events ───────────────────────────────────────────────────
 *  task_due_today    → lib/notifications/task-cron.ts (morning sweep)
 *  task_due_tomorrow → lib/notifications/task-cron.ts (morning sweep)
 *  task_overdue      → lib/notifications/task-cron.ts (evening sweep, once per task)
 */

import { createNotification } from "@/lib/notifications/service";

// ─── Shared helpers ───────────────────────────────────────────────────────────

function formatDate(date: Date | null | undefined): string {
  if (!date) return "No due date";
  return new Date(date).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ─── Task Assigned ────────────────────────────────────────────────────────────

export interface TaskAssignedParams {
  orgId: string;
  taskId: string;
  taskSubject: string;
  /** The userId being assigned (new assignee). */
  newAssigneeId: string;
  /** The userId that was previously assigned, or null for a new task. */
  oldAssigneeId: string | null;
  /** The user making the assignment. */
  actorUserId: string;
  actorName: string;
  dueDate: Date | null | undefined;
  priority: string;
}

/**
 * Notify the new assignee when a task is assigned (create or reassign).
 *
 * Guards:
 *  - No change in assignee → skip.
 *  - Actor assigns to themselves → skip (self-assignment).
 */
export async function notifyTaskAssigned(
  params: TaskAssignedParams,
): Promise<void> {
  const {
    orgId, taskId, taskSubject,
    newAssigneeId, oldAssigneeId,
    actorUserId, actorName,
    dueDate, priority,
  } = params;

  if (!newAssigneeId) return;
  if (newAssigneeId === oldAssigneeId) return;    // No real change.
  if (newAssigneeId === actorUserId) return;      // Self-assignment.

  const isReassignment = Boolean(oldAssigneeId && oldAssigneeId !== newAssigneeId);
  const verb = isReassignment ? "reassigned" : "assigned";
  const due = formatDate(dueDate);

  await createNotification({
    orgId,
    userId: newAssigneeId,
    // Reuse lead_assigned type → blue UserPlus icon in notification center.
    type: "lead_assigned",
    category: "lead",
    title: isReassignment ? "Task reassigned to you" : "Task assigned to you",
    body: `"${taskSubject}" was ${verb} to you by ${actorName}. Due: ${due}. Priority: ${priority}.`,
    link: `/tasks`,
    metadata: {
      type: "task_assigned",
      taskId,
      taskSubject,
      assignedByName: actorName,
      assignedByUserId: actorUserId,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      priority,
      isReassignment,
    },
  });
}

// ─── Task Completed ───────────────────────────────────────────────────────────

export interface TaskCompletedParams {
  orgId: string;
  taskId: string;
  taskSubject: string;
  /** The user who marked the task complete (the actor). */
  completedByUserId: string;
  completedByName: string;
  /** The user who created/assigned the task — the recipient of this notification. */
  taskCreatorUserId: string | null | undefined;
}

/**
 * Notify the task creator/assigner when someone else marks the task as completed.
 *
 * Guards:
 *  - No creator → skip.
 *  - Creator completed their own task → skip (they already know).
 */
export async function notifyTaskCompleted(
  params: TaskCompletedParams,
): Promise<void> {
  const {
    orgId, taskId, taskSubject,
    completedByUserId, completedByName,
    taskCreatorUserId,
  } = params;

  if (!taskCreatorUserId) return;
  // Creator completed their own task — no need to notify them.
  if (taskCreatorUserId === completedByUserId) return;

  await createNotification({
    orgId,
    userId: taskCreatorUserId,
    // Emerald CheckCircle2 icon — "done" semantic.
    type: "lead_converted",
    category: "lead",
    title: "Task completed",
    body: `${completedByName} completed your task "${taskSubject}".`,
    link: `/tasks`,
    metadata: {
      type: "task_completed",
      taskId,
      taskSubject,
      completedByName,
      completedByUserId,
    },
  });
}

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
 *                           Notifies the assignee when someone else marks it done.
 *                           Note: CrmTask has no createdByUserId field — the
 *                           assignee is the closest meaningful recipient.
 *                           When actor === assignee (they completed their own task),
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
  /** The user who marked the task as completed. */
  completedByUserId: string;
  completedByName: string;
  /**
   * The task's assignee at the time of completion.
   *
   * Limitation: CrmTask has no createdByUserId column, so we notify the assignee
   * (the person responsible for the task). If the assignee is the one who
   * completed it themselves this is suppressed.
   */
  assignedToUserId: string | null | undefined;
}

/**
 * Notify the task assignee when someone else marks the task as completed.
 *
 * Guards:
 *  - No assignee → skip.
 *  - Assignee completed their own task → skip (they already know).
 */
export async function notifyTaskCompleted(
  params: TaskCompletedParams,
): Promise<void> {
  const {
    orgId, taskId, taskSubject,
    completedByUserId, completedByName,
    assignedToUserId,
  } = params;

  if (!assignedToUserId) return;
  // Assignee completed their own task — no need to notify them.
  if (assignedToUserId === completedByUserId) return;

  await createNotification({
    orgId,
    userId: assignedToUserId,
    // Emerald CheckCircle2 icon — "done" semantic.
    type: "lead_converted",
    category: "lead",
    title: "Task marked as completed",
    body: `"${taskSubject}" was marked as completed by ${completedByName}.`,
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

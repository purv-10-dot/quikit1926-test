/**
 * Notification system — shared types.
 *
 * Phase 1 covers lead lifecycle events only. The type enum is the canonical
 * discriminant stored in `CrmNotification.metadata.type`; the `category`
 * field on the DB row uses the broader "lead" | "task" | "system" bucket so
 * the client can group / filter by category without parsing metadata.
 */

// ─── Notification types ───────────────────────────────────────────────────────

export type NotificationType =
  /** A lead was assigned to the recipient for the first time. */
  | "lead_assigned"
  /** A lead the recipient owned was reassigned to someone else. */
  | "lead_reassigned"
  /** The stage of a lead the recipient owns changed. */
  | "lead_stage_changed"
  /** A lead the recipient owns was converted into a contact / opportunity. */
  | "lead_converted";

export type NotificationCategory = "lead" | "task" | "automation" | "system";

// ─── Payload used to CREATE a notification ────────────────────────────────────

export interface NotificationPayload {
  orgId: string;
  userId: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  body: string;
  /** Optional relative path — e.g. "/leads/abc123". */
  link?: string;
  /** Arbitrary extra context surfaced in the UI. Always includes `type`. */
  metadata?: Record<string, unknown>;
  /**
   * When true, skip email delivery even if the user has email enabled.
   * Useful when the actor and recipient are the same person.
   */
  skipEmail?: boolean;
}

// ─── Shape returned from the API / used in the client ─────────────────────────

export interface NotificationRow {
  id: string;
  orgId: string;
  userId: string;
  title: string;
  body: string | null;
  category: string | null;
  link: string | null;
  readAt: Date | string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date | string;
}

// ─── Per-type metadata shapes (for discriminated-union access in UI) ──────────

export interface LeadAssignedMeta {
  type: "lead_assigned";
  leadId: string;
  leadName: string;
  assignedByName: string;
}

export interface LeadReassignedMeta {
  type: "lead_reassigned";
  leadId: string;
  leadName: string;
  newOwnerName: string;
  assignedByName: string;
}

export interface LeadStageChangedMeta {
  type: "lead_stage_changed";
  leadId: string;
  leadName: string;
  fromStage: string;
  toStage: string;
  actorName: string;
}

export interface LeadConvertedMeta {
  type: "lead_converted";
  leadId: string;
  leadName: string;
  convertedByName: string;
  contactId: string | null;
  opportunityId: string | null;
}

// ─── Task metadata shapes ─────────────────────────────────────────────────────
//
// Task notifications reuse lead NotificationType values as icon proxies; the
// real discriminant is metadata.type below. These interfaces document the
// metadata each task trigger / cron sweep writes.

export interface TaskAssignedMeta {
  type: "task_assigned";
  taskId: string;
  taskSubject: string;
  assignedByName: string;
  assignedByUserId: string;
  dueDate: string | null;
  priority: string;
  isReassignment: boolean;
}

export interface TaskCompletedMeta {
  type: "task_completed";
  taskId: string;
  taskSubject: string;
  completedByName: string;
  completedByUserId: string;
}

export interface TaskDueMeta {
  type: "task_due_today" | "task_due_tomorrow";
  taskId: string;
  taskSubject: string;
  dueDate: string | null;
  priority: string;
}

export interface TaskOverdueMeta {
  type: "task_overdue";
  taskId: string;
  taskSubject: string;
  dueDate: string | null;
  priority: string;
}

export type NotificationMeta =
  | LeadAssignedMeta
  | LeadReassignedMeta
  | LeadStageChangedMeta
  | LeadConvertedMeta
  | TaskAssignedMeta
  | TaskCompletedMeta
  | TaskDueMeta
  | TaskOverdueMeta;

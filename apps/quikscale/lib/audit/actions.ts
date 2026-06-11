/**
 * Audit action vocabulary + classifier.
 *
 * `AuditEvent.action` is a free-text column in the DB; this module is the
 * single source of truth for the allowed values and for deriving the most
 * specific action from a field-level diff. Pure functions only.
 */

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "ARCHIVE"
  | "RESTORE"
  | "STATUS_CHANGE"
  | "ASSIGNMENT_CHANGE"
  | "OWNERSHIP_CHANGE"
  | "PERMISSION_CHANGE"
  | "WEEKLY_UPDATE"
  | "BULK_UPDATE"
  | "COMMENT";

/** Changing any of these promotes a generic UPDATE to OWNERSHIP_CHANGE. */
export const OWNERSHIP_FIELDS = ["owner", "ownerIds", "ownerContributions"] as const;
/** Changing any of these promotes a generic UPDATE to ASSIGNMENT_CHANGE. */
export const ASSIGNMENT_FIELDS = ["teamId"] as const;
/** Changing any of these promotes a generic UPDATE to STATUS_CHANGE.
 *  `status` is KPI/WWW's field; `overallStatus` is Priority's; `isActive` is
 *  Client Master's active/inactive flag; `callStatus` is the Daily Huddle's
 *  meeting outcome (Held / Not Held / …). */
export const STATUS_FIELDS = ["status", "overallStatus", "isActive", "callStatus"] as const;

function intersects(changed: readonly string[], group: readonly string[]): boolean {
  return changed.some((f) => group.includes(f));
}

/**
 * Pick the headline action for an update given which fields changed.
 *
 * Precedence (most → least significant):
 *   OWNERSHIP_CHANGE > ASSIGNMENT_CHANGE > STATUS_CHANGE > UPDATE
 *
 * The headline is only a label for the timeline; the full set of field-level
 * changes is always recorded as AuditChange rows regardless of the headline.
 * When nothing changed, returns "UPDATE" (callers typically skip logging a
 * zero-change update — see audit.log).
 */
export function classifyUpdateAction(changedFields: readonly string[]): AuditAction {
  if (intersects(changedFields, OWNERSHIP_FIELDS)) return "OWNERSHIP_CHANGE";
  if (intersects(changedFields, ASSIGNMENT_FIELDS)) return "ASSIGNMENT_CHANGE";
  if (intersects(changedFields, STATUS_FIELDS)) return "STATUS_CHANGE";
  return "UPDATE";
}

/** The action filter buckets used by the Change History panel tabs. */
export type AuditFilterBucket = "create" | "update" | "delete";

/** Map a stored action to its filter bucket (All/Create/Update/Delete tabs). */
export function actionBucket(action: string): AuditFilterBucket {
  switch (action) {
    case "CREATE":
      return "create";
    case "DELETE":
    case "ARCHIVE":
      return "delete";
    default:
      // UPDATE, STATUS_CHANGE, OWNERSHIP_CHANGE, ASSIGNMENT_CHANGE,
      // PERMISSION_CHANGE, WEEKLY_UPDATE, BULK_UPDATE, RESTORE, COMMENT
      return "update";
  }
}

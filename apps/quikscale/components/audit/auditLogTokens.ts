/**
 * Canonical audit-log design tokens — the single source of truth for the 8
 * operation-pill colours and the module "pillar" badge colours.
 *
 * `OperationPill` and the Legend render exclusively from this map, so colours
 * never drift. `audit-log-tokens.css` mirrors these as CSS custom properties
 * for any non-React consumer.
 */

export type Operation =
  | "CREATED"
  | "UPDATED"
  | "DELETED"
  | "RESTORED"
  | "WEEKLY"
  | "BULK"
  | "COMMENT"
  | "STATUS";

export interface OperationToken {
  label: string;
  /** Foreground (text) colour. */
  fg: string;
  /** Background colour. */
  bg: string;
  /** One-line meaning shown in the Legend popover. */
  meaning: string;
}

export const OPERATION_TOKENS: Record<Operation, OperationToken> = {
  CREATED: { label: "CREATED", fg: "#15803d", bg: "#dcfce7", meaning: "First save of the record" },
  UPDATED: { label: "UPDATED", fg: "#1d4ed8", bg: "#dbeafe", meaning: "Field edit — target, owner, cadence, name, description" },
  DELETED: { label: "DELETED", fg: "#b91c1c", bg: "#fee2e2", meaning: "Soft-delete with a reason" },
  RESTORED: { label: "RESTORED", fg: "#0f766e", bg: "#ccfbf1", meaning: "Restored from soft-delete" },
  WEEKLY: { label: "WEEKLY", fg: "#b45309", bg: "#fef3c7", meaning: "Weekly value entry (one per week)" },
  BULK: { label: "BULK", fg: "#6d28d9", bg: "#ede9fe", meaning: "One save that updated several weeks' values at once" },
  COMMENT: { label: "COMMENT", fg: "#4338ca", bg: "#e0e7ff", meaning: "Free-text note attached to the record" },
  STATUS: { label: "STATUS", fg: "#0e7490", bg: "#cffafe", meaning: "Lifecycle status change (not used by KPI)" },
};

/** Order used by the Legend popover (all 8, including STATUS). */
export const OPERATION_ORDER: Operation[] = [
  "CREATED",
  "UPDATED",
  "DELETED",
  "RESTORED",
  "WEEKLY",
  "BULK",
  "COMMENT",
  "STATUS",
];

/** Module "pillar" badge colours. KPI is in the Execution pillar (red). */
export const PILLAR_TOKENS = {
  execution: "#dc2626",
  alignment: "#2563eb",
  people: "#7c3aed",
  cadence: "#0891b2",
} as const;

/**
 * Map a stored AuditEvent.action to its display operation pill.
 *
 * KPI never surfaces a STATUS pill: a `status` field change (and owner /
 * assignment / permission changes) all render as UPDATED. STATUS exists in the
 * token map only so the shared Legend can list all 8 operations.
 */
export function operationForAction(action: string): Operation {
  switch (action) {
    case "CREATE":
      return "CREATED";
    case "DELETE":
    case "ARCHIVE":
      return "DELETED";
    case "RESTORE":
      return "RESTORED";
    case "WEEKLY_UPDATE":
      return "WEEKLY";
    case "BULK_UPDATE":
      return "BULK";
    case "COMMENT":
      return "COMMENT";
    default:
      // UPDATE | STATUS_CHANGE | OWNERSHIP_CHANGE | ASSIGNMENT_CHANGE | PERMISSION_CHANGE
      return "UPDATED";
  }
}

/**
 * Priority-specific audit field configuration.
 *
 * Mirrors lib/audit/kpiFields.ts so the generic audit engine
 * (diff/actions/audit) stays entity-agnostic. Shared by the Priority capture
 * points (which fields to diff) and the Change History panel (how to label
 * fields in the timeline).
 */

/**
 * Derived / system-managed fields that should NOT appear as user-facing
 * changes in the timeline. Everything else on a Priority is diffed via the
 * whitelist below.
 */
export const PRIORITY_AUDIT_EXCLUDE = [
  "id",
  "orgId",
  "createdAt",
  "updatedAt",
  "createdBy",
  "updatedBy",
  "deletedAt",
  "weeklyStatuses",
  "owner_user",
  "team",
] as const;

/** Human-readable labels for Priority fields shown in the Change History timeline. */
export const PRIORITY_FIELD_LABELS: Record<string, string> = {
  name: "Priority Name",
  description: "Description",
  owner: "Owner",
  teamId: "Team",
  quarter: "Quarter",
  year: "Year",
  startWeek: "Start Week",
  endWeek: "End Week",
  overallStatus: "Status",
  notes: "Notes",
};

/**
 * Whitelist of user-editable Priority fields to diff on UPDATE. Derived from
 * the label map so adding a labelled field automatically makes it auditable.
 * A whitelist keeps the diff immune to differing `select` projections between
 * the before/after rows (e.g. nested owner_user/team relations).
 */
export const PRIORITY_AUDIT_FIELDS = Object.keys(PRIORITY_FIELD_LABELS);

/** Friendly label for a Priority field name, falling back to the raw key. */
export function priorityFieldLabel(field: string): string {
  return PRIORITY_FIELD_LABELS[field] ?? field;
}

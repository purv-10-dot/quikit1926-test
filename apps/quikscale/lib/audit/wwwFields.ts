/**
 * WWW-specific audit field configuration.
 *
 * Mirrors lib/audit/kpiFields.ts + priorityFields.ts so the generic audit
 * engine stays entity-agnostic. Shared by the WWW capture points (which fields
 * to diff) and the Change History panel (how to label fields).
 */

/**
 * Derived / system-managed / synthesized fields that should NOT appear as
 * user-facing changes in the timeline.
 */
export const WWW_AUDIT_EXCLUDE = [
  "id",
  "orgId",
  "createdAt",
  "updatedAt",
  "createdBy",
  "updatedBy",
  "deletedAt",
  "whoIds", // synthesized at the API boundary from the scalar `who`
  "linkedPriorityId",
  "linkedKPIId",
  "who_user",
  "who_users",
  "revisionLogs",
  "url",
] as const;

/** Human-readable labels for WWW fields shown in the Change History timeline. */
export const WWW_FIELD_LABELS: Record<string, string> = {
  who: "Who",
  what: "What",
  when: "When",
  status: "Status",
  category: "Category",
  notes: "Notes",
  originalDueDate: "Original Due Date",
  revisedDates: "Revised Dates",
};

/**
 * Whitelist of user-editable WWW fields to diff on UPDATE. Derived from the
 * label map so adding a labelled field automatically makes it auditable.
 */
export const WWW_AUDIT_FIELDS = Object.keys(WWW_FIELD_LABELS);

/** Friendly label for a WWW field name, falling back to the raw key. */
export function wwwFieldLabel(field: string): string {
  return WWW_FIELD_LABELS[field] ?? field;
}

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

/**
 * WWW fields whose values are ISO date strings (or, for `revisedDates`, an
 * array of them). Used to drive friendly date rendering in the Change History
 * diff so the drawer shows "25 Jun 2026" instead of "2026-06-25T00:00:00.000Z".
 */
export const WWW_DATE_FIELDS = new Set(["when", "originalDueDate", "revisedDates"]);

/**
 * Format an ISO date string as "25 Jun 2026" (UTC, date-only). WWW dates are
 * stored at midnight UTC, so we format in UTC to avoid an off-by-one day from
 * the viewer's timezone. Falls back to the raw input when it isn't a parseable
 * date, and "—" for empty values. Shared by the CREATE card and the diff.
 */
export function formatWWWDate(iso: string | null | undefined): string {
  if (iso === null || iso === undefined || iso === "") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

/**
 * Per-field value formatter for the Change History diff (the `formatFieldValue`
 * hook on the WWW audit config). Renders WWW date fields as friendly dates and
 * returns `undefined` for everything else so the generic formatter handles it.
 *
 * For the `revisedDates` array field the diff renderer calls this per element,
 * so each element (an ISO string) is formatted individually. Empty/null/non-
 * string values return `undefined` to fall back to the default "—" display.
 */
export function formatWWWFieldValue(fieldName: string, value: unknown): string | undefined {
  if (!WWW_DATE_FIELDS.has(fieldName)) return undefined;
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value !== "string") return undefined;
  return formatWWWDate(value);
}

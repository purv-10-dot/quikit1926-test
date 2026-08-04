/**
 * Fold raw `groupBy(type)` rows into the "Activity Types" summary shown above
 * the Activities table.
 *
 * Labels come from the org's CrmActivityType rows (code → label), so custom
 * types created in Settings → Activity Types appear here automatically and
 * nothing is hardcoded.
 *
 * Two realities of the `type` column drive the normalization:
 *
 *  1. CASE / FORMAT DRIFT. `CrmActivity.type` is a free-form String, not an
 *     enum, and writers disagree: the email pipeline writes "email" while the
 *     telephony engine writes "Call" and the task service writes
 *     "TaskStatusChange". Matching to a configured type is therefore done on a
 *     normalized key (lowercased, non-alphanumerics collapsed to "_") so
 *     "Follow-up", "follow_up" and "FOLLOW UP" all resolve to the same chip.
 *
 *  2. SYSTEM-GENERATED TYPES. Rows like "TaskStatusChange" or "LeadStageChange"
 *     have no CrmActivityType row — they are audit events, not loggable types.
 *     They still exist in the filtered set and the table still shows them, so
 *     the summary must not silently drop them; they get a humanized fallback
 *     label ("Task Status Change") and are sorted after the configured types.
 *
 * Ordering follows the admin's configured sortOrder so the chips read in the
 * same order as the type-picker, with unconfigured types last (alphabetical).
 * Stable ordering matters: chips must not reshuffle between refetches.
 */

export interface ActivityTypeSummaryRow {
  /** Normalized key — stable id for React and test assertions. */
  key: string;
  /** Display label: the configured CrmActivityType.label when one matches. */
  label: string;
  count: number;
}

export interface RawTypeCount {
  type: string;
  count: number;
}

/** A configured activity type, as stored in CrmActivityType. */
export interface ConfiguredType {
  code: string;
  label: string;
  sortOrder: number;
}

/**
 * Canonical matching key. Lowercase, and every run of non-alphanumeric
 * characters becomes a single "_" so "Follow-up" ≡ "follow_up" ≡ "Follow Up".
 * Also splits camelCase/PascalCase ("TaskStatusChange" → "task_status_change")
 * so system events collapse consistently.
 */
export function normalizeTypeKey(raw: string): string {
  return raw
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** "task_status_change" → "Task Status Change" (fallback for unconfigured types). */
function humanize(key: string): string {
  if (!key) return "Unspecified";
  return key
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function summarizeByActivityType(
  rows: RawTypeCount[],
  configured: ConfiguredType[],
): ActivityTypeSummaryRow[] {
  // code → { label, sortOrder }, keyed by the same normalization as the data.
  const byKey = new Map<string, { label: string; sortOrder: number }>();
  configured.forEach((t, i) => {
    byKey.set(normalizeTypeKey(t.code), {
      label: t.label,
      // Seeded rows can share sortOrder 0; fall back to array position so the
      // admin's listing order is preserved rather than collapsing to a tie.
      sortOrder: t.sortOrder * 1000 + i,
    });
  });

  const totals = new Map<string, number>();
  for (const row of rows) {
    if (row.count <= 0) continue; // requirement: hide zero-count types
    const key = normalizeTypeKey(row.type);
    if (!key) continue;
    totals.set(key, (totals.get(key) ?? 0) + row.count);
  }

  return [...totals.entries()]
    .map(([key, count]) => {
      const cfg = byKey.get(key);
      return { key, label: cfg?.label ?? humanize(key), count };
    })
    .sort((a, b) => {
      const ca = byKey.get(a.key);
      const cb = byKey.get(b.key);
      if (ca && cb) return ca.sortOrder - cb.sortOrder;
      if (ca) return -1; // configured types first
      if (cb) return 1;
      return a.label.localeCompare(b.label);
    });
}

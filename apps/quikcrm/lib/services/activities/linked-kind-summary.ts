/**
 * Fold raw `groupBy(relatedKind)` rows into the "Linked To" summary shown above
 * the Activities table.
 *
 * Two normalizations matter here:
 *  1. CASE. The DB holds both "Lead" and "lead" (see activity-acl.ts, which
 *     matches `{ in: ["Lead", "lead"] }`, and the GET route which ORs a
 *     lowercased kind). A raw groupBy therefore returns them as SEPARATE
 *     buckets; without folding, the UI would show "Lead (3)" twice.
 *  2. STANDALONE. `relatedKind` is a NOT NULL column, so an unlinked activity
 *     stores the sentinel "None" (target-existence.ts). "Standalone" is a
 *     UI-only label — matching how the table cell renders it.
 *
 * Empty groups are dropped, and ordering is stable (canonical kinds first in a
 * fixed order, Standalone last, anything unrecognized in between alphabetically)
 * so chips don't reshuffle between refetches.
 */

import {
  ACTIVITY_PRIMARY_KINDS,
  STANDALONE_KIND,
} from "@/lib/services/activities/target-existence";

export interface LinkedKindSummaryRow {
  /** Canonical stored kind — "Lead" | "Opportunity" | "Contact" | "Account" | "None". */
  kind: string;
  /** Display label; "None" renders as "Standalone". */
  label: string;
  count: number;
}

export interface RawKindCount {
  relatedKind: string;
  count: number;
}

/** Canonical display order: primary kinds as declared, Standalone always last. */
const KIND_ORDER: string[] = [...ACTIVITY_PRIMARY_KINDS];

/**
 * Map a stored kind to its canonical casing. Unknown kinds keep their original
 * spelling (we don't silently swallow data we didn't anticipate) but are still
 * case-folded so "foo"/"Foo" merge into one bucket.
 */
function canonicalKind(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return STANDALONE_KIND;
  const lower = trimmed.toLowerCase();
  if (lower === STANDALONE_KIND.toLowerCase()) return STANDALONE_KIND;
  const known = ACTIVITY_PRIMARY_KINDS.find((k) => k.toLowerCase() === lower);
  if (known) return known;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

export function linkedKindLabel(kind: string): string {
  return kind === STANDALONE_KIND ? "Standalone" : kind;
}

export function summarizeByLinkedKind(rows: RawKindCount[]): LinkedKindSummaryRow[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (row.count <= 0) continue; // requirement: never show an empty group
    const kind = canonicalKind(row.relatedKind);
    totals.set(kind, (totals.get(kind) ?? 0) + row.count);
  }

  return [...totals.entries()]
    .map(([kind, count]) => ({ kind, label: linkedKindLabel(kind), count }))
    .sort((a, b) => {
      const ai = KIND_ORDER.indexOf(a.kind);
      const bi = KIND_ORDER.indexOf(b.kind);
      // Standalone pins to the end; unknown kinds sit between known and Standalone.
      const rank = (kind: string, idx: number) =>
        kind === STANDALONE_KIND ? 2 : idx >= 0 ? 0 : 1;
      const ra = rank(a.kind, ai);
      const rb = rank(b.kind, bi);
      if (ra !== rb) return ra - rb;
      if (ra === 0) return ai - bi;
      return a.kind.localeCompare(b.kind);
    });
}

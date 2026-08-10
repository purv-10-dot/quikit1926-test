"use client";

/**
 * "Linked To" summary row — sits between the applied-filter chips and the
 * activities table and shows how the CURRENTLY FILTERED activities break down
 * by linked record type.
 *
 * Colours intentionally reuse the same per-kind badge tokens as the table's
 * "Linked To" cell so a chip up here reads as the same thing as the badge in
 * the rows below. Hardcoded (not accent-*) because they encode record type,
 * not brand — see CLAUDE.md.
 */

import type { LinkedKindSummaryRow } from "@/lib/services/activities/linked-kind-summary";
import { KIND_BADGE, KIND_BADGE_FALLBACK } from "./kind-badge-tokens";

export interface LinkedToSummaryProps {
  groups: LinkedKindSummaryRow[];
  loading?: boolean;
}

export function LinkedToSummary({ groups, loading = false }: LinkedToSummaryProps) {
  // Nothing to describe → render nothing rather than an empty bar. During a
  // refetch we keep the previous groups mounted (dimmed) so the row doesn't
  // collapse and shift the table on every keystroke.
  if (groups.length === 0) return null;

  return (
    <div
      className={`flex flex-wrap items-center gap-2 transition-opacity ${
        loading ? "opacity-60" : "opacity-100"
      }`}
      role="region"
      aria-label="Linked To summary"
      aria-busy={loading}
      data-testid="activities-linked-summary"
    >
      <span className="text-xs font-medium text-crm-muted">Linked To:</span>
      {groups.map((g) => (
        <span
          key={g.kind}
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset ${
            KIND_BADGE[g.kind] ?? KIND_BADGE_FALLBACK
          }`}
          data-testid={`activities-linked-summary-${g.kind}`}
        >
          {g.label}
          <span className="tabular-nums opacity-80">({g.count.toLocaleString()})</span>
        </span>
      ))}
    </div>
  );
}

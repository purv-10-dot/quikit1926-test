"use client";

/**
 * "Activity Types" summary row — sits between the applied-filter chips and the
 * activities table and shows how the CURRENTLY FILTERED activities break down
 * by activity type.
 *
 * Labels and ordering come from the server (the org's CrmActivityType config),
 * so custom types added in Settings → Activity Types show up with no change
 * here. There is deliberately no per-type colour map: types are admin-defined
 * and open-ended, so a fixed palette would leave custom types unstyled. All
 * chips share the neutral badge treatment used elsewhere on this page.
 */

import type { ActivityTypeSummaryRow } from "@/lib/services/activities/type-summary";

export interface ActivityTypeSummaryProps {
  groups: ActivityTypeSummaryRow[];
  loading?: boolean;
}

export function ActivityTypeSummary({
  groups,
  loading = false,
}: ActivityTypeSummaryProps) {
  // Nothing to describe → render nothing rather than an empty bar. During a
  // refetch the previous chips stay mounted (dimmed) so the row doesn't
  // collapse and shift the table on every keystroke.
  if (groups.length === 0) return null;

  return (
    <div
      className={`flex flex-wrap items-center gap-2 transition-opacity ${
        loading ? "opacity-60" : "opacity-100"
      }`}
      role="region"
      aria-label="Activity type summary"
      aria-busy={loading}
      data-testid="activities-type-summary"
    >
      <span className="text-xs font-medium text-crm-muted">Activity Types:</span>
      {groups.map((g) => (
        <span
          key={g.key}
          className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200"
          data-testid={`activities-type-summary-${g.key}`}
        >
          {g.label}
          <span className="tabular-nums opacity-80">({g.count.toLocaleString()})</span>
        </span>
      ))}
    </div>
  );
}

"use client";

import {
  AUTOMATION_STATUS_ORDER,
  MANUAL_STATUS_ORDER,
  countOf,
  donutSegments,
  executedTests,
  passRate,
  statusMeta,
  totalTests,
  untestedRate,
  type StatusCounts,
  type TestStatusKey,
} from "@/lib/test/statuses";

/**
 * Run summary widget — the donut plus the two count columns, matching the
 * TestRail reference UI:
 *
 *        ●  0 Passed        ● 0 Automation Passed
 *    ◯   ●  0 Blocked       ● 0 Automation Failed
 *        ●  0 Skipped       ● 0 Automation Error
 *        ●  0 Failed
 *              0% Passed
 *          18 / 18 untested (100%)
 *
 * The manual/automation split is the point of the widget, so the two columns
 * are fixed rather than collapsed when automation counts are zero — a run with
 * no automation should visibly read as "no automation ran", not hide the column.
 *
 * Presentational only: takes counts, renders. All maths lives in
 * `lib/test/statuses.ts` so the dashboards and the work-item panel compute
 * identical numbers.
 */

interface RunSummaryProps {
  counts: StatusCounts;
  /** Compact variant for the work-item panel; default is the full page size. */
  size?: "sm" | "md";
}

function CountRow({ statusKey, counts }: { statusKey: TestStatusKey; counts: StatusCounts }) {
  const meta = statusMeta(statusKey);
  const n = countOf(counts, statusKey);
  const total = totalTests(counts);
  const share = total === 0 ? 0 : Math.round((n / total) * 100);

  return (
    <div className="flex items-start gap-2">
      <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} />
      <div className="min-w-0">
        <div className="text-sm font-semibold text-gray-900">
          {n} <span className="font-normal text-gray-700">{meta.label}</span>
        </div>
        <div className="truncate text-[11px] text-gray-500">
          {share}% set to {meta.label}
        </div>
      </div>
    </div>
  );
}

export function RunSummary({ counts, size = "md" }: RunSummaryProps) {
  const segments = donutSegments(counts);
  const total = totalTests(counts);
  const executed = executedTests(counts);
  const untested = countOf(counts, "untested");
  const rate = passRate(counts);

  // Tailwind can't express a computed conic-gradient, so the ring is an inline
  // style built from the segment stops.
  const gradient = `conic-gradient(${segments
    .map((s) => {
      const color = DOT_TO_CSS[s.dot] ?? "#9ca3af";
      return `${color} ${s.from}% ${s.to}%`;
    })
    .join(", ")})`;

  const ring = size === "sm" ? "h-24 w-24" : "h-36 w-36";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <div
          className={`${ring} shrink-0 rounded-full`}
          style={{ background: gradient }}
          role="img"
          aria-label={`${rate}% passed of ${executed} executed tests`}
        />

        <div className="flex flex-1 flex-wrap gap-x-10 gap-y-2">
          <div className="space-y-2">
            {MANUAL_STATUS_ORDER.map((key) => (
              <CountRow key={key} statusKey={key} counts={counts} />
            ))}
          </div>
          <div className="space-y-2">
            {AUTOMATION_STATUS_ORDER.map((key) => (
              <CountRow key={key} statusKey={key} counts={counts} />
            ))}
          </div>
        </div>
      </div>

      <div className="text-center">
        <div className="text-sm font-semibold text-gray-900">{rate}% Passed</div>
        <div className="text-xs text-gray-500">
          {untested} / {total} untested ({untestedRate(counts)}%).
        </div>
      </div>
    </div>
  );
}

/**
 * Tailwind class → hex, needed because the donut is an inline conic-gradient.
 * Keys mirror the `dot` values in `lib/test/statuses.ts`; keep the two in step.
 */
const DOT_TO_CSS: Record<string, string> = {
  "bg-green-500": "#22c55e",
  "bg-green-700": "#15803d",
  "bg-gray-700": "#374151",
  "bg-gray-400": "#9ca3af",
  "bg-yellow-400": "#facc15",
  "bg-rose-600": "#e11d48",
  "bg-red-600": "#dc2626",
  "bg-blue-500": "#3b82f6",
  "bg-gray-200": "#e5e7eb",
};

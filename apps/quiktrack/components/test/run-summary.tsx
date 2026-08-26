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
 * Run summary widget — a true RING (hole in the middle, QUIKTR-341 restyle) plus
 * the two count columns, each row showing its count and share inline:
 *
 *              ● 0 Passed      0%     ● 0 Automation Passed   0%
 *      ⬭ 100%  ● 0 Blocked     0%     ● 0 Automation Failed   0%
 *              ● 0 Skipped     0%     ● 0 Automation Error    0%
 *              ● 0 Failed      0%
 *
 * Previously a filled disc (solid conic-gradient circle) with the percentage
 * spelled out on its own line below each count — this cuts a hole in the
 * middle via a radial-gradient mask and moves the percentage onto the same
 * line as the count, both to match the reference UI directly.
 *
 * Shared by the runner page AND the work-item QuikTest panel
 * (quiktest-results-panel.tsx) — restyled here once so both stay visually
 * consistent, rather than forking a second ring component.
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
    <div className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} />
      <span className="text-sm font-semibold text-gray-900">{n}</span>
      <span className="truncate text-sm text-gray-700">{meta.label}</span>
      <span className="ml-auto shrink-0 text-xs text-gray-400">{share}%</span>
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
  // Punches the hole: a radial-gradient mask over the conic-gradient background
  // rather than an inner absolutely-positioned circle, so the ring works at any
  // size (including a future custom `ring` class) without a second element to
  // keep centred.
  const holeMask =
    "radial-gradient(circle, transparent 58%, black 58.5%)";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <div className="relative shrink-0">
          <div
            className={`${ring} rounded-full`}
            style={{ background: gradient, WebkitMaskImage: holeMask, maskImage: holeMask }}
            role="img"
            aria-label={`${rate}% passed of ${executed} executed tests`}
          />
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-sm font-semibold text-gray-900">{rate}%</span>
            <span className="text-[10px] text-gray-500">Passed</span>
          </div>
        </div>

        <div className="flex flex-1 flex-wrap gap-x-10 gap-y-2">
          <div className="min-w-[160px] space-y-1.5">
            {MANUAL_STATUS_ORDER.map((key) => (
              <CountRow key={key} statusKey={key} counts={counts} />
            ))}
          </div>
          <div className="min-w-[160px] space-y-1.5">
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

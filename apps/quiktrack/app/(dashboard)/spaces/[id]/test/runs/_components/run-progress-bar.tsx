"use client";

import { PROGRESS_ORDER, progressSegments } from "@/lib/test/runLifecycle";
import { statusMeta, totalTests, type StatusCounts } from "@/lib/test/statuses";

/**
 * Segmented progress bar for a run (QUIKTR-338).
 *
 * Shares `progressSegments` with the run summary so a bar and the numbers beside
 * it can never disagree. Colours come from `statusMeta`, which uses fixed
 * semantic Tailwind values rather than `accent-*` — these are data states (root
 * CLAUDE.md rule).
 */
export function RunProgressBar({
  counts,
  className = "",
}: {
  counts: StatusCounts;
  className?: string;
}) {
  const total = totalTests(counts);
  const segments = progressSegments(counts, PROGRESS_ORDER);

  if (total === 0) {
    return (
      <div
        className={`h-1.5 w-full rounded-full bg-gray-100 ${className}`}
        title="No tests in this run"
      />
    );
  }

  return (
    <div
      className={`flex h-1.5 w-full overflow-hidden rounded-full bg-gray-100 ${className}`}
      role="img"
      aria-label={segments
        .map((s) => `${statusMeta(s.key).label}: ${s.count}`)
        .join(", ")}
    >
      {segments.map((s) => (
        <div
          key={s.key}
          className={statusMeta(s.key).dot}
          style={{ width: `${s.percent}%` }}
          title={`${statusMeta(s.key).label}: ${s.count}`}
        />
      ))}
    </div>
  );
}

/** Compact count chips under the bar — the spec's "full result counts". */
export function RunCountChips({ counts }: { counts: StatusCounts }) {
  const segments = progressSegments(counts, PROGRESS_ORDER);
  if (segments.length === 0) {
    return <span className="text-[11px] text-gray-400">No tests</span>;
  }

  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {segments.map((s) => (
        <span
          key={s.key}
          className="inline-flex items-center gap-1 text-[11px] text-gray-500"
        >
          <span className={`inline-block h-2 w-2 rounded-full ${statusMeta(s.key).dot}`} />
          {statusMeta(s.key).label} {s.count}
        </span>
      ))}
    </span>
  );
}

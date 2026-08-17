"use client";

import {
  LIFECYCLE_HINT,
  LIFECYCLE_LABEL,
  PROGRESS_ORDER,
  progressSegments,
  runLifecycle,
} from "@/lib/test/runLifecycle";
import {
  countOf,
  executedTests,
  passRate,
  statusMeta,
  totalTests,
  untestedRate,
  type StatusCounts,
} from "@/lib/test/statuses";
import { RunProgressBar } from "../../_components/run-progress-bar";

/**
 * Progress tab (QUIKTR-339) — how far through the run we are, per status.
 *
 * Deliberately reports two different denominators side by side, because conflating
 * them is the classic test-reporting lie: pass rate is a share of EXECUTED tests,
 * while the progress bar and the untested figure are shares of ALL tests. A run
 * with one pass and 99 untested is "100% passed" and "1% complete", and both
 * numbers have to be visible for either to mean anything.
 */
export function RunProgressPane({
  counts,
  state,
  testCount,
}: {
  counts: StatusCounts;
  state: string;
  testCount: number;
}) {
  const total = totalTests(counts);
  const executed = executedTests(counts);
  const phase = runLifecycle({ state, counts, testCount });
  const segments = progressSegments(counts, PROGRESS_ORDER);

  if (total === 0) {
    return (
      <p className="p-4 text-sm text-gray-500">
        This run has no tests, so there is no progress to report.
      </p>
    );
  }

  const completion = Math.round((executed / total) * 100);

  return (
    <div className="space-y-5 overflow-auto p-4">
      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Execution progress
          </span>
          <span className="text-sm font-medium text-gray-800">
            {completion}% complete
          </span>
        </div>
        <RunProgressBar counts={counts} className="h-2.5" />
        <p className="mt-1 text-[11px] text-gray-500">
          {executed} of {total} tests executed · {countOf(counts, "untested")}{" "}
          untested ({untestedRate(counts)}%)
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded border border-gray-200 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">
            Pass rate
          </p>
          <p className="text-lg font-semibold text-gray-900">
            {/* A dash, not 0% — nothing executed means no rate exists, whereas
                "0%" reads as "everything failed". */}
            {executed === 0 ? "—" : `${passRate(counts)}%`}
          </p>
          <p className="text-[11px] text-gray-400">of executed tests</p>
        </div>
        <div className="rounded border border-gray-200 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">
            Lifecycle
          </p>
          <p className="text-lg font-semibold text-gray-900">
            {LIFECYCLE_LABEL[phase]}
          </p>
          <p className="text-[11px] text-gray-400">{LIFECYCLE_HINT[phase]}</p>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Breakdown
        </p>
        <table className="w-full text-sm">
          <tbody>
            {segments.map((s) => {
              const meta = statusMeta(s.key);
              return (
                <tr key={s.key} className="border-b border-gray-100">
                  <td className="py-1.5">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                      <span className="text-gray-700">{meta.label}</span>
                    </span>
                  </td>
                  <td className="py-1.5 text-right text-gray-800">{s.count}</td>
                  <td className="w-16 py-1.5 text-right text-[11px] text-gray-400">
                    {s.percent}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

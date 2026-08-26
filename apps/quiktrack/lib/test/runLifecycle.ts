import {
  countOf,
  totalTests,
  type StatusCounts,
  type TestStatusKey,
} from "./statuses";

/**
 * Run lifecycle grouping for the runs list (QUIKTR-338).
 *
 * TestRail groups runs into three sections. Only one of them is stored:
 *
 *   Open               — still being executed
 *   Completion Pending — every test has a result, but nobody has closed the run
 *   Completed          — closed
 *
 * "Completion Pending" is DERIVED (`state=open` AND nothing untested), so no
 * schema change is needed. It is the section that earns its keep: it is exactly
 * the set of runs a QA lead should be signing off, and today they are
 * indistinguishable from runs still in progress.
 */

export type RunLifecycle = "open" | "completion_pending" | "completed";

export interface RunLike {
  state: string;
  counts: StatusCounts;
  /** Materialised test count. Falls back to the count map when absent. */
  testCount?: number;
}

export const LIFECYCLE_ORDER: readonly RunLifecycle[] = [
  "open",
  "completion_pending",
  "completed",
];

export const LIFECYCLE_LABEL: Record<RunLifecycle, string> = {
  open: "Open",
  completion_pending: "Completion Pending",
  completed: "Completed",
};

export const LIFECYCLE_HINT: Record<RunLifecycle, string> = {
  open: "Still being executed.",
  completion_pending:
    "Every test has a result — these are waiting to be reviewed and closed.",
  completed: "Closed. Results are frozen.",
};

/**
 * Which section a run belongs in.
 *
 * Two deliberate rules:
 *
 * 1. A closed run is `completed` regardless of its counts. Closing is an explicit
 *    human act; a closed run with untested tests is a legitimate "we stopped
 *    here", not a pending one.
 * 2. A run with NO tests is `open`, never `completion_pending`. Zero untested out
 *    of zero total is vacuously "all executed" — calling an empty run ready for
 *    sign-off is the worst possible reading, because it invites closing a run
 *    that never tested anything.
 */
export function runLifecycle(run: RunLike): RunLifecycle {
  if (run.state === "closed") return "completed";

  const total = run.testCount ?? totalTests(run.counts);
  if (total === 0) return "open";

  const untested = countOf(run.counts, "untested");
  // `retest` deliberately does NOT block completion: it carries a result. A
  // reviewer asking for another pass is a review decision, and the run is still
  // theirs to close.
  return untested === 0 ? "completion_pending" : "open";
}

/** Groups runs into the three sections, preserving each list's input order. */
export function groupByLifecycle<T extends RunLike>(
  runs: T[],
): Record<RunLifecycle, T[]> {
  const out: Record<RunLifecycle, T[]> = {
    open: [],
    completion_pending: [],
    completed: [],
  };
  for (const run of runs) out[runLifecycle(run)].push(run);
  return out;
}

/**
 * Segments for a run's horizontal progress bar, as percentages of ALL tests
 * (untested included — the bar shows how much of the run is done).
 *
 * Widths are emitted as exact percentages and the LAST segment absorbs the
 * rounding remainder, so the bar always fills exactly 100% rather than leaving a
 * sliver of background that reads as unaccounted work.
 */
export function progressSegments(
  counts: StatusCounts,
  order: readonly TestStatusKey[],
): Array<{ key: TestStatusKey; count: number; percent: number }> {
  const total = totalTests(counts);
  if (total === 0) return [];

  const present = order
    .map((key) => ({ key, count: countOf(counts, key) }))
    .filter((s) => s.count > 0);

  let used = 0;
  return present.map((s, i) => {
    const isLast = i === present.length - 1;
    const percent = isLast
      ? Math.max(0, 100 - used)
      : Math.round((s.count / total) * 1000) / 10;
    used += percent;
    return { ...s, percent };
  });
}

/** Bar order: outcomes first, unexecuted last, so progress reads left to right. */
export const PROGRESS_ORDER: readonly TestStatusKey[] = [
  "passed",
  "automation_passed",
  "failed",
  "automation_failed",
  "automation_error",
  "blocked",
  "skipped",
  "retest",
  "untested",
];

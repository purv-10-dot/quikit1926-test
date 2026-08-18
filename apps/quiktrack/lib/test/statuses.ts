/**
 * QuikTest — status vocabulary and result-count maths.
 *
 * The status list is derived from the TestRail reference UI, which shows eight
 * distinct buckets split into a manual column and an automation column:
 *
 *     Passed              Automation Passed
 *     Blocked             Automation Failed
 *     Skipped             Automation Error
 *     Failed
 *     (Untested — the default, counted separately)
 *
 * Kept here as pure data + pure functions so the dashboards, the run summary
 * donut and the work-item panel all agree, and so the maths is unit-testable
 * without a database. The seeded `QtTestStatus` rows (P0) mirror these keys.
 */

/** Stable status key. Persisted as `QtTestStatus.name`. */
export type TestStatusKey =
  | "untested"
  | "passed"
  | "failed"
  | "blocked"
  | "retest"
  | "skipped"
  | "automation_passed"
  | "automation_failed"
  | "automation_error";

export interface TestStatusMeta {
  key: TestStatusKey;
  label: string;
  /**
   * Semantic state colour — hardcoded per the root CLAUDE.md rule that data
   * states use fixed Tailwind colours, never `accent-*`.
   */
  dot: string;
  pill: string;
  /** Terminal outcome — excluded from "still to execute" counts. */
  isFinal: boolean;
  /** Produced by CI rather than a human. Drives the two-column split. */
  isAutomation: boolean;
  /** Exactly one status is the default for a freshly materialised test. */
  isDefault: boolean;
}

export const TEST_STATUSES: readonly TestStatusMeta[] = [
  {
    key: "passed",
    label: "Passed",
    dot: "bg-green-500",
    pill: "bg-green-100 text-green-800",
    isFinal: true,
    isAutomation: false,
    isDefault: false,
  },
  {
    key: "blocked",
    label: "Blocked",
    dot: "bg-gray-700",
    pill: "bg-gray-200 text-gray-800",
    isFinal: true,
    isAutomation: false,
    isDefault: false,
  },
  {
    key: "skipped",
    label: "Skipped",
    dot: "bg-yellow-400",
    pill: "bg-yellow-100 text-yellow-800",
    isFinal: true,
    isAutomation: false,
    isDefault: false,
  },
  {
    key: "failed",
    label: "Failed",
    dot: "bg-rose-600",
    pill: "bg-rose-100 text-rose-800",
    isFinal: true,
    isAutomation: false,
    isDefault: false,
  },
  {
    key: "retest",
    label: "Retest",
    dot: "bg-blue-500",
    pill: "bg-blue-100 text-blue-800",
    isFinal: false,
    isAutomation: false,
    isDefault: false,
  },
  {
    key: "untested",
    label: "Untested",
    dot: "bg-gray-400",
    pill: "bg-gray-100 text-gray-700",
    isFinal: false,
    isAutomation: false,
    isDefault: true,
  },
  {
    key: "automation_passed",
    label: "Automation Passed",
    dot: "bg-green-700",
    pill: "bg-green-100 text-green-900",
    isFinal: true,
    isAutomation: true,
    isDefault: false,
  },
  {
    key: "automation_failed",
    label: "Automation Failed",
    dot: "bg-red-600",
    pill: "bg-red-100 text-red-900",
    isFinal: true,
    isAutomation: true,
    isDefault: false,
  },
  {
    key: "automation_error",
    label: "Automation Error",
    dot: "bg-gray-400",
    pill: "bg-gray-200 text-gray-700",
    isFinal: true,
    isAutomation: true,
    isDefault: false,
  },
];

/**
 * The rows every org must have in `QtTestStatus`, and the ONLY definition of them.
 *
 * These mirror the seed in `20260807120000_quiktest_test_management/migration.sql`
 * exactly — same keys, labels, hex colours, flags and order. Kept here as well
 * because that seed was a `CROSS JOIN quikit."Org"`, i.e. a one-shot backfill over
 * orgs that existed when the migration ran: any org created afterwards had NO
 * statuses, and creating a run there failed with "No default test status is
 * configured for this organisation."
 *
 * `ensureTestStatuses()` provisions from this list, so a new org is never in that
 * state. The Tailwind classes above are for rendering; `color` is what the DB
 * stores and what a custom status would set.
 */
export interface TestStatusSeed {
  key: TestStatusKey;
  label: string;
  /** Hex, because `QtTestStatus.color` is a hex string, not a Tailwind class. */
  color: string;
  isFinal: boolean;
  isDefault: boolean;
  isAutomation: boolean;
  orderNo: number;
}

export const TEST_STATUS_SEED: readonly TestStatusSeed[] = [
  { key: "passed", label: "Passed", color: "#22c55e", isFinal: true, isDefault: false, isAutomation: false, orderNo: 1 },
  { key: "blocked", label: "Blocked", color: "#374151", isFinal: true, isDefault: false, isAutomation: false, orderNo: 2 },
  { key: "skipped", label: "Skipped", color: "#facc15", isFinal: true, isDefault: false, isAutomation: false, orderNo: 3 },
  { key: "failed", label: "Failed", color: "#e11d48", isFinal: true, isDefault: false, isAutomation: false, orderNo: 4 },
  { key: "retest", label: "Retest", color: "#3b82f6", isFinal: false, isDefault: false, isAutomation: false, orderNo: 5 },
  // Exactly one row may have isDefault = true — enforced by a partial unique index
  // (`QtTestStatus_orgId_default_uniq`), which is why provisioning must never
  // insert a second default.
  { key: "untested", label: "Untested", color: "#9ca3af", isFinal: false, isDefault: true, isAutomation: false, orderNo: 6 },
  { key: "automation_passed", label: "Automation Passed", color: "#15803d", isFinal: true, isDefault: false, isAutomation: true, orderNo: 7 },
  { key: "automation_failed", label: "Automation Failed", color: "#dc2626", isFinal: true, isDefault: false, isAutomation: true, orderNo: 8 },
  { key: "automation_error", label: "Automation Error", color: "#9ca3af", isFinal: true, isDefault: false, isAutomation: true, orderNo: 9 },
];

const BY_KEY = new Map<TestStatusKey, TestStatusMeta>(
  TEST_STATUSES.map((s) => [s.key, s]),
);

export function statusMeta(key: TestStatusKey): TestStatusMeta {
  const meta = BY_KEY.get(key);
  if (!meta) throw new Error(`Unknown test status '${key}'`);
  return meta;
}

/** The manual column of the run summary, in reference-UI order. */
export const MANUAL_STATUS_ORDER: readonly TestStatusKey[] = [
  "passed",
  "blocked",
  "skipped",
  "failed",
];

/** The automation column of the run summary, in reference-UI order. */
export const AUTOMATION_STATUS_ORDER: readonly TestStatusKey[] = [
  "automation_passed",
  "automation_failed",
  "automation_error",
];

/** Sparse count map — absent keys are zero. */
export type StatusCounts = Partial<Record<TestStatusKey, number>>;

export function countOf(counts: StatusCounts, key: TestStatusKey): number {
  return counts[key] ?? 0;
}

/** Total tests in the run, including untested. */
export function totalTests(counts: StatusCounts): number {
  return TEST_STATUSES.reduce((sum, s) => sum + countOf(counts, s.key), 0);
}

/**
 * Tests that have actually been executed — everything except `untested`.
 *
 * `retest` counts as executed: it has a result behind it (someone ran it and
 * asked for another pass), unlike `untested`, which never ran.
 */
export function executedTests(counts: StatusCounts): number {
  return totalTests(counts) - countOf(counts, "untested");
}

/** Passed by either path — the numerator for the headline rate. */
export function passedTests(counts: StatusCounts): number {
  return countOf(counts, "passed") + countOf(counts, "automation_passed");
}

/** Failed by either path. */
export function failedTests(counts: StatusCounts): number {
  return (
    countOf(counts, "failed") +
    countOf(counts, "automation_failed") +
    countOf(counts, "automation_error")
  );
}

/**
 * Pass rate as a 0–100 percentage **of executed tests** — untested is excluded
 * from the denominator and reported separately (plan §4 decision, matching the
 * reference UI's `0% Passed · 18 / 18 untested (100%)`).
 *
 * Returns 0 for an all-untested run rather than NaN, so callers can render it
 * directly; use `executedTests() === 0` to distinguish "nothing run" from
 * "everything failed".
 */
export function passRate(counts: StatusCounts): number {
  const executed = executedTests(counts);
  if (executed === 0) return 0;
  return Math.round((passedTests(counts) / executed) * 100);
}

/** Untested share of the whole run, for the `18 / 18 untested (100%)` line. */
export function untestedRate(counts: StatusCounts): number {
  const total = totalTests(counts);
  if (total === 0) return 0;
  return Math.round((countOf(counts, "untested") / total) * 100);
}

/**
 * Conic-gradient stops for the summary donut, in reference-UI order. Returns a
 * single grey ring when the run has no tests at all, so an empty run still
 * renders a circle instead of collapsing.
 */
export function donutSegments(
  counts: StatusCounts,
): Array<{ key: TestStatusKey; from: number; to: number; dot: string }> {
  const total = totalTests(counts);
  if (total === 0) {
    return [{ key: "untested", from: 0, to: 100, dot: statusMeta("untested").dot }];
  }

  const order: TestStatusKey[] = [
    ...MANUAL_STATUS_ORDER,
    ...AUTOMATION_STATUS_ORDER,
    "retest",
    "untested",
  ];

  const segments: Array<{ key: TestStatusKey; from: number; to: number; dot: string }> = [];
  let cursor = 0;
  for (const key of order) {
    const n = countOf(counts, key);
    if (n === 0) continue;
    const span = (n / total) * 100;
    segments.push({ key, from: cursor, to: cursor + span, dot: statusMeta(key).dot });
    cursor += span;
  }
  return segments;
}

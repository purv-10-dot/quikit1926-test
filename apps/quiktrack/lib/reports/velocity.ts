/**
 * Velocity report calculation engine.
 *
 * Jira semantics: velocity is frozen ONCE, at "Complete sprint", into a
 * QtSprintSnapshot row, and never recomputed. Per sprint it captures:
 *   - Committed = every scoped issue in the sprint at completion time
 *   - Completed = the subset in a DONE status at that moment
 * …for BOTH story points (QtIssue.storyPoints) and estimated hours
 * (QtIssue.eta — the original estimate; logged/timesheet hours are NOT used).
 *
 * Only estimable leaf work counts. EPIC and SUBTASK are structural (epics
 * aggregate; subtasks roll up into their parent), and BUG is excluded by
 * product requirement — velocity measures planned delivery, not defect churn.
 * See {@link isVelocityScopedType}.
 *
 * These helpers are pure — callers pass plain rows, the functions return plain
 * numbers/objects. Same inputs → same output, so the logic is shared by the
 * completion route (which persists the result) and unit-tested in isolation.
 * The report route does NOT call these — it reads the stored snapshot verbatim.
 */

/** Issue types that count toward velocity. Excludes EPIC, SUBTASK and BUG. */
const VELOCITY_EXCLUDED_TYPES: ReadonlySet<string> = new Set(["EPIC", "SUBTASK", "BUG"]);

/** True when an issue type is estimable leaf work that counts toward velocity. */
export function isVelocityScopedType(type: string): boolean {
  return !VELOCITY_EXCLUDED_TYPES.has(type.toUpperCase());
}

/** Minimal issue shape the velocity sums need. */
export interface VelocityIssue {
  id: string;
  type: string;
  /** Story points (null → 0). */
  storyPoints: number | null;
  /** Estimated hours — QtIssue.eta, the original estimate (null → 0). */
  eta: number | null;
  /** Status category of the issue's status ("DONE" | "IN_PROGRESS" | …). */
  statusCategory: string;
}

/** The full frozen velocity metric set for one sprint (both point + hour axes). */
export interface SprintVelocityMetrics {
  committedPoints: number;
  completedPoints: number;
  committedHours: number;
  completedHours: number;
  committedCount: number;
  completedCount: number;
  /** Points-based completion %: round(completed/committed * 100), 0 if none. */
  completionPct: number;
  /** Ids of the scoped (committed) issues, frozen for audit/traceability. */
  committedIssueIds: string[];
}

/**
 * Compute the complete velocity metric set for a sprint at completion time.
 * `issues` is every issue currently in the sprint (call this BEFORE moving
 * incomplete items out). Scoped to leaf work (EPIC/SUBTASK/BUG excluded);
 * "completed" = scoped issues in a DONE status.
 */
export function computeSprintVelocity(issues: VelocityIssue[]): SprintVelocityMetrics {
  const scoped = issues.filter((i) => isVelocityScopedType(i.type));
  const done = scoped.filter((i) => i.statusCategory === "DONE");

  const committedPoints = sum(scoped, (i) => i.storyPoints);
  const completedPoints = sum(done, (i) => i.storyPoints);

  return {
    committedPoints,
    completedPoints,
    committedHours: sum(scoped, (i) => i.eta),
    completedHours: sum(done, (i) => i.eta),
    committedCount: scoped.length,
    completedCount: done.length,
    completionPct: committedPoints > 0 ? Math.round((completedPoints / committedPoints) * 100) : 0,
    committedIssueIds: scoped.map((i) => i.id),
  };
}

function sum(issues: VelocityIssue[], pick: (i: VelocityIssue) => number | null): number {
  return issues.reduce((acc, i) => acc + (pick(i) ?? 0), 0);
}

// The mean of a completed series (the "Average" velocity line) is shared with
// the productivity report — reuse `averageVelocity(number[])` from
// lib/reports/productivity.ts rather than duplicating the reducer here.

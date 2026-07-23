/**
 * Velocity report calculation engine (Story Points variant).
 *
 * Velocity compares, per sprint:
 *   - Committed  = Σ storyPoints of the issues in the sprint at START
 *   - Completed  = Σ storyPoints of those committed issues that ended DONE
 *
 * Only estimable leaf work counts. EPIC and SUBTASK are structural (epics
 * aggregate; subtasks roll up into their parent), and BUG is excluded by
 * product requirement — velocity measures planned delivery, not defect churn.
 * See {@link isVelocityScopedType}.
 *
 * These helpers are intentionally pure — callers pass plain rows, the functions
 * return plain numbers/objects. Same inputs → same output, so the logic is
 * shared by the snapshot-capture routes (sprint start / complete) and the
 * report route, and unit-tested in isolation.
 *
 * NOTE on "committed hours": the doc also describes a hours variant. QtIssue has
 * no dedicated estimated-hours field today (only `storyPoints` and `eta`), so
 * the hours toggle ships in a follow-up. This module is points-only for now.
 */

/** Issue types that count toward velocity. Excludes EPIC, SUBTASK and BUG. */
const VELOCITY_EXCLUDED_TYPES: ReadonlySet<string> = new Set(["EPIC", "SUBTASK", "BUG"]);

/** True when an issue type is estimable leaf work that counts toward velocity. */
export function isVelocityScopedType(type: string): boolean {
  return !VELOCITY_EXCLUDED_TYPES.has(type.toUpperCase());
}

/** Minimal issue shape the scope + point sums need. */
export interface VelocityIssue {
  id: string;
  type: string;
  storyPoints: number | null;
  /** Status category of the issue's current status ("DONE" | "IN_PROGRESS" | …). */
  statusCategory: string;
}

/** The frozen "committed" scope captured at sprint start. */
export interface CommittedScope {
  committedPoints: number;
  committedCount: number;
  /** Ids of the committed (in-scope) issues — frozen so completed is computed
   *  against the same set at close, immune to mid-sprint add/remove. */
  committedIssueIds: string[];
}

/**
 * Compute the committed scope from the issues assigned to a sprint at START.
 * Filters to velocity-scoped types (drops EPIC/SUBTASK/BUG), sums storyPoints
 * (null → 0), and freezes the surviving issue ids.
 */
export function computeCommittedScope(issues: VelocityIssue[]): CommittedScope {
  const scoped = issues.filter((i) => isVelocityScopedType(i.type));
  return {
    committedPoints: scoped.reduce((sum, i) => sum + (i.storyPoints ?? 0), 0),
    committedCount: scoped.length,
    committedIssueIds: scoped.map((i) => i.id),
  };
}

/** The "completed" result computed at close against the committed set. */
export interface CompletedResult {
  completedPoints: number;
  completedCount: number;
}

/**
 * Compute completed points/count: of the frozen committed set, the subset whose
 * status ended in a DONE category. `committedIssueIds` is the frozen scope;
 * `issues` are those same issues with their final status. Any committed id that
 * no longer resolves (e.g. deleted) simply doesn't count as completed.
 *
 * The type-scope filter (EPIC/SUBTASK/BUG out) is re-applied here too, so an
 * out-of-scope id that somehow made it into a snapshot (legacy/hand-seeded data)
 * can never leak into the completed tally.
 */
export function computeCompleted(
  committedIssueIds: string[],
  issues: VelocityIssue[],
): CompletedResult {
  const committed = new Set(committedIssueIds);
  const done = issues.filter(
    (i) =>
      committed.has(i.id) &&
      i.statusCategory === "DONE" &&
      isVelocityScopedType(i.type),
  );
  return {
    completedPoints: done.reduce((sum, i) => sum + (i.storyPoints ?? 0), 0),
    completedCount: done.length,
  };
}

/** One sprint's velocity row, as the report API returns it. */
export interface VelocitySprintPoint {
  sprintId: string;
  sprintName: string;
  status: string;
  committedPoints: number;
  completedPoints: number;
  committedCount: number;
  completedCount: number;
  /** True when committed/completed came from a frozen snapshot rather than a
   *  live recompute — lets the UI mark estimated (live) vs authoritative rows. */
  fromSnapshot: boolean;
}

// The mean of a completed-points series (the "Average" velocity line) is shared
// with the productivity report — reuse `averageVelocity(number[])` from
// lib/reports/productivity.ts rather than duplicating the reducer here.

/**
 * Shared past-week edit rules for KPI weekly data (values + target breakdown).
 *
 * Pure + dependency-free so it's the single source of truth for BOTH the client
 * (Updates tab, Edit-tab breakdown, save guard) and the server routes that gate
 * past-week edits.
 *
 * Rule: when `canEditPastWeek` is OFF, the editable window is the current week
 * plus a small grace of earlier weeks (`PAST_WEEK_EDIT_GRACE`). With a grace of
 * 1 and current week 13, weeks 12 and 13 are editable; weeks ≤ 11 are locked.
 * When ON, all past weeks are editable.
 */

/** How many weeks before the current week stay editable when edit-past is OFF. */
export const PAST_WEEK_EDIT_GRACE = 1;

/**
 * The earliest week a user may edit.
 *   - edit-past ON  → 1 (everything editable)
 *   - edit-past OFF → currentWeek − grace, floored at 1
 */
export function earliestEditableWeek(currentWeek: number, canEditPastWeek: boolean): number {
  if (canEditPastWeek) return 1;
  return Math.max(1, currentWeek - PAST_WEEK_EDIT_GRACE);
}

/** True when `week` is older than the editable window (too far in the past). */
export function isWeekBeforeEditableWindow(
  week: number,
  currentWeek: number,
  canEditPastWeek: boolean,
): boolean {
  return week < earliestEditableWeek(currentWeek, canEditPastWeek);
}

/**
 * Past/future week-lock decision for the KPI Updates tab.
 *
 * Display-only gating — the server independently enforces the same rule via
 * `isWeekBeforeEditableWindow`.
 *
 *   - `flagsLoaded === false` OR `currentWeek == null` → LOCKED. We don't yet
 *     know the current week or the org's edit-past flag, so we default to
 *     locked rather than briefly exposing past weeks as editable while state
 *     resolves.
 *   - before the editable window → locked (`isPast`).
 *   - future week (`week > currentWeek`) → always locked.
 *   - inside the window (current week + grace) → editable.
 */
export interface WeekLockState {
  isPast: boolean;
  isFuture: boolean;
  locked: boolean;
}

export function weeklyInputLockState(opts: {
  week: number;
  currentWeek: number | null;
  canEditPastWeek: boolean;
  flagsLoaded: boolean;
}): WeekLockState {
  const { week, currentWeek, canEditPastWeek, flagsLoaded } = opts;

  // State not resolved yet → lock everything until we can classify reliably.
  if (!flagsLoaded || currentWeek === null) {
    return { isPast: false, isFuture: false, locked: true };
  }

  const isFuture = week > currentWeek;
  // "Past" here means "locked because it's older than the editable window" —
  // so the current-week-minus-grace week is NOT flagged as a locked past week.
  const isPast = isWeekBeforeEditableWindow(week, currentWeek, canEditPastWeek);
  const locked = isPast || isFuture;

  return { isPast, isFuture, locked };
}

/** Where the panel's quarter sits relative to today (see fiscal.resolveQuarterPosition). */
export type QuarterPosition = "past" | "current" | "future";

/**
 * Is `week` strictly in the PAST relative to today, quarter/year-aware?
 *
 *   - past quarter   → every week is past (the whole quarter is over)
 *   - future quarter → no week is past (the quarter hasn't started)
 *   - current quarter → weeks before the in-progress `currentWeek`
 *
 * This is the quarter-aware replacement for a bare `week < currentWeek` check.
 * `useCurrentWeek` clamps a past quarter to its last week and a future quarter
 * to week 1, so the bare check mis-classifies a past quarter's final week as
 * "current" (and a future quarter's first week as "current"). Used by the KPI
 * Target-Breakdown gates (past-week target editing + the Standalone per-week
 * override), which must treat an entire closed quarter uniformly.
 *
 * NOTE: unlike `weekEditState`, this deliberately does NOT lock future quarters
 * or apply the current-week grace — the breakdown lets you plan future-quarter
 * targets and uses a hard past-week binary (no grace). It only answers "is this
 * week in the past?"; callers combine it with the relevant flag.
 */
export function isWeekInPast(
  quarterPosition: QuarterPosition,
  week: number,
  currentWeek: number | null,
): boolean {
  if (quarterPosition === "past") return true;
  if (quarterPosition === "future") return false;
  return currentWeek !== null && week < currentWeek;
}

/**
 * Quarter/year-AWARE week-edit gate — the single source of truth for every
 * weekly-status / weekly-value surface (Priority weekly tab, KPI Updates tab)
 * and their server routes.
 *
 * The historical bug: gates used only the in-quarter week number, and
 * `useCurrentWeek` clamps a past quarter to `weekCount` and a future quarter to
 * `1`. So a past quarter's LAST week and a future quarter's FIRST week slipped
 * through as "editable". Feeding `quarterPosition` fixes that:
 *
 *   - future quarter → every week locked (can't fill in a quarter that hasn't
 *     started), regardless of flags.
 *   - past quarter   → every week locked UNLESS `canEditPastWeek` is on (then
 *     the whole finished quarter is editable).
 *   - current quarter → the per-week window applies: future weeks locked, and
 *     when edit-past is OFF only the current week + `PAST_WEEK_EDIT_GRACE`
 *     earlier weeks are editable (grace 1 ⇒ current week and the one before it).
 *
 * `flagsLoaded` should be false until BOTH the flags and the quarter position
 * are known, so nothing briefly renders editable while state resolves.
 */
export function weekEditState(opts: {
  quarterPosition: QuarterPosition;
  week: number;
  currentWeek: number | null;
  canEditPastWeek: boolean;
  flagsLoaded: boolean;
}): WeekLockState {
  const { quarterPosition, week, currentWeek, canEditPastWeek, flagsLoaded } = opts;

  if (!flagsLoaded) return { isPast: false, isFuture: false, locked: true };

  if (quarterPosition === "future") {
    return { isPast: false, isFuture: true, locked: true };
  }
  if (quarterPosition === "past") {
    // Whole quarter is behind us — editable only when edit-past is allowed.
    return { isPast: !canEditPastWeek, isFuture: false, locked: !canEditPastWeek };
  }
  // Current quarter → per-week window (future weeks locked, past beyond grace locked).
  return weeklyInputLockState({ week, currentWeek, canEditPastWeek, flagsLoaded });
}

/** The Priority weekly status that is allowed to propagate into future weeks. */
export const COMPLETED_STATUS = "completed";

/**
 * May a weekly-status WRITE for `week` with `status` be persisted?
 *
 * Extends `weekEditState` with the Priority "Completed" cascade exception:
 * marking a week Completed propagates "completed" forward to the later weeks of
 * the SAME (current) quarter, INCLUDING future weeks. "Completed" is a terminal,
 * forward-only state, so pre-filling it ahead of the current week is intentional
 * — unlike every other status, which stays blocked on future weeks so users
 * can't pre-declare progress they haven't made.
 *
 * Relaxed ONLY for: current quarter + future week + `status === "completed"`.
 * NOT relaxed for past weeks, past quarters, or a wholly-future quarter (you
 * can't complete a quarter that hasn't started — the cascade can't originate
 * there because its trigger week would itself be locked).
 *
 * Single source of truth for the client cascade and BOTH server routes
 * (`/weekly` and `/weekly/batch`).
 */
export function isWeeklyWriteAllowed(opts: {
  quarterPosition: QuarterPosition;
  week: number;
  currentWeek: number | null;
  canEditPastWeek: boolean;
  flagsLoaded: boolean;
  status: string;
}): boolean {
  const { quarterPosition, week, currentWeek, canEditPastWeek, flagsLoaded, status } = opts;
  const gate = weekEditState({ quarterPosition, week, currentWeek, canEditPastWeek, flagsLoaded });
  if (!gate.locked) return true;
  // Completed-cascade exception — future week inside the current quarter only.
  return quarterPosition === "current" && gate.isFuture && status === COMPLETED_STATUS;
}

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

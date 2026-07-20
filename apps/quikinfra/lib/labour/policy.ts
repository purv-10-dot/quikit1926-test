/**
 * Labour module policy constants — single source of truth.
 *
 * Keep every tunable labour rule here so it changes in one place (the PRD
 * anticipates these becoming per-tenant config later; hardcoded in v1).
 */

/** A muster for date X can be created/submitted only within this many hours of X. */
export const MUSTER_WINDOW_HOURS = 72;

/** Statutory departmental overtime multiplier (double rate). */
export const OT_MULTIPLIER = 2.0;

/** Standard working hours per day — OT day-equivalent = otHours / this. */
export const HOURS_PER_DAY = 8;

/**
 * A workman's combined APPROVED attendance across projects for one date may
 * not exceed this (small travel/split-day tolerance).
 */
export const DOUBLE_MARK_TOLERANCE = 1.25;

/** Allowed per-line attendance fractions. */
export const ALLOWED_ATTENDANCE = [0, 0.25, 0.5, 0.75, 1.0] as const;

export const MAX_OT_HOURS = 8;

export type EngagementType = "CONTRACTOR" | "DEPARTMENTAL";
export type MusterShift = "DAY" | "NIGHT";
export type MusterStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "REVERSED";

/** True if `dateStr` (yyyy-mm-dd) is within MUSTER_WINDOW_HOURS of `now`. */
export function isWithinMusterWindow(dateStr: string, now: Date): boolean {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  const diffMs = now.getTime() - d.getTime();
  // Future dates are not allowed; past dates only within the window.
  if (diffMs < -24 * 3600 * 1000) return false; // allow up to 1 day ahead (timezone slack)
  return diffMs <= MUSTER_WINDOW_HOURS * 3600 * 1000;
}

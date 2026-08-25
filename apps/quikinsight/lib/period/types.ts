/**
 * Period-comparison domain model.
 *
 * Pure types + no runtime deps, so this file is safe to import from both client
 * components and route handlers.
 *
 * WHY ABSOLUTE DATES. Windows are inclusive ISO `YYYY-MM-DD` strings, never
 * relative offsets like GA4's `28daysAgo`. A request that straddles midnight UTC
 * would otherwise resolve to two different windows for two different connectors,
 * and the comparison would silently compare mismatched periods. Connectors that
 * want relative strings derive them from these absolute dates, not the reverse.
 */

/** Inclusive date window. Both ends are `YYYY-MM-DD`. */
export interface DateWindow {
  start: string;
  end: string;
}

/**
 * How the baseline window is derived.
 *
 * `previous` is length-relative (the N days immediately before the current
 * window); `mom`/`yoy` are calendar-aligned, so their baseline may be a
 * different number of days than the current window. That asymmetry is correct
 * for calendar comparisons and is why the UI always shows both literal ranges.
 */
export type CompareMode = "none" | "previous" | "wow" | "mom" | "yoy" | "custom";

/** Preset current-window lengths, mirroring the existing range-select options. */
export type RangePreset = 7 | 30 | 90 | 365 | "custom";

/**
 * What the UI holds and what round-trips through the URL.
 *
 * Deliberately NOT the resolved windows — those are recomputed from `now` at
 * render time, because a spec stored across midnight would otherwise resolve to
 * a stale window.
 */
export interface PeriodSpec {
  preset: RangePreset;
  /** Only meaningful when `preset === "custom"`. */
  customStart?: string;
  customEnd?: string;
  compare: CompareMode;
  /** Only meaningful when `compare === "custom"`. */
  compareStart?: string;
  compareEnd?: string;
}

/** A fully-resolved selection: concrete windows, ready to hand to a connector. */
export interface PeriodSelection {
  mode: CompareMode;
  current: DateWindow;
  /** `null` exactly when `mode === "none"`, or when a custom baseline is invalid. */
  previous: DateWindow | null;
}

/**
 * Whether a delta could be computed for a given surface.
 *
 * `unavailable` is NOT the same as a delta of zero, and the distinction is the
 * whole point of the type: several connectors expose only a point-in-time
 * snapshot (current follower count, current open pipeline) and cannot answer for
 * a past window at all. Reporting those as 0% would fabricate a "no change"
 * finding. See lib/period/capability.ts.
 */
export type ComparisonAvailability = "available" | "unavailable" | "off";

export const DEFAULT_PERIOD: PeriodSpec = { preset: 30, compare: "none" };

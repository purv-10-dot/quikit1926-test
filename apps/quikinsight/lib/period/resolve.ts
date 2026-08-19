/**
 * Turns a PeriodSpec into concrete date windows, and moves it over the wire.
 *
 * Every function here is pure and takes `now` as an injectable argument, so the
 * unit tests never depend on the wall clock.
 */
import {
  addDays,
  differenceInCalendarDays,
  format,
  isValid,
  parseISO,
  subDays,
  subMonths,
  subYears,
} from "date-fns";
import {
  DEFAULT_PERIOD,
  type CompareMode,
  type DateWindow,
  type PeriodSelection,
  type PeriodSpec,
  type RangePreset,
} from "./types";

/** Widest window we will ask a platform API for. Guards quota and URL abuse. */
export const MAX_WINDOW_DAYS = 365;

const ISO = "yyyy-MM-dd";
const COMPARE_MODES: CompareMode[] = ["none", "previous", "wow", "mom", "yoy", "custom"];
const PRESETS: RangePreset[] = [7, 30, 90, 365, "custom"];

export function toISO(d: Date): string {
  return format(d, ISO);
}

/** Parses `YYYY-MM-DD`. Returns null for anything malformed rather than an Invalid Date. */
export function parseISODate(s: string | null | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = parseISO(s);
  return isValid(d) ? d : null;
}

/** Inclusive length. A window whose start and end are the same day is 1 day long. */
export function windowDays(w: DateWindow): number {
  const a = parseISODate(w.start);
  const b = parseISODate(w.end);
  if (!a || !b) return 0;
  return differenceInCalendarDays(b, a) + 1;
}

export function isValidWindow(w: DateWindow | null | undefined): boolean {
  if (!w) return false;
  const days = windowDays(w);
  return days >= 1 && days <= MAX_WINDOW_DAYS;
}

/**
 * The current window for a spec.
 *
 * Presets are trailing windows ending today, inclusive — `preset: 7` is today
 * plus the previous six days, which is what "last 7 days" means to a user.
 */
function resolveCurrent(spec: PeriodSpec, now: Date): DateWindow {
  if (spec.preset === "custom") {
    const s = parseISODate(spec.customStart);
    const e = parseISODate(spec.customEnd);
    if (s && e && s <= e) return { start: toISO(s), end: toISO(e) };
    // Malformed custom range falls back to the default preset rather than
    // throwing — this runs on user-supplied query params.
    return resolveCurrent({ ...DEFAULT_PERIOD }, now);
  }
  return { start: toISO(subDays(now, spec.preset - 1)), end: toISO(now) };
}

/**
 * The baseline window.
 *
 * `previous`/`wow` are length-relative: the same number of days ending the day
 * before `current` starts. `mom`/`yoy` shift by calendar month/year instead, so
 * a 31-day January compared month-over-month lands on a 28-day February — the
 * day counts genuinely differ and the UI surfaces both ranges for that reason.
 */
function resolvePrevious(spec: PeriodSpec, current: DateWindow, now: Date): DateWindow | null {
  const start = parseISODate(current.start);
  const end = parseISODate(current.end);
  if (!start || !end) return null;

  switch (spec.compare) {
    case "none":
      return null;

    case "previous":
    case "wow": {
      const len = windowDays(current);
      const prevEnd = subDays(start, 1);
      return { start: toISO(subDays(prevEnd, len - 1)), end: toISO(prevEnd) };
    }

    case "mom":
      return { start: toISO(subMonths(start, 1)), end: toISO(subMonths(end, 1)) };

    case "yoy":
      return { start: toISO(subYears(start, 1)), end: toISO(subYears(end, 1)) };

    case "custom": {
      const s = parseISODate(spec.compareStart);
      const e = parseISODate(spec.compareEnd);
      if (!s || !e || s > e) return null;
      const w = { start: toISO(s), end: toISO(e) };
      return isValidWindow(w) ? w : null;
    }

    default:
      return null;
  }
}

/**
 * Resolve a spec into concrete windows.
 *
 * Never throws: this sits directly behind query-param parsing, so bad input
 * degrades to the default range with no comparison rather than 500-ing.
 */
export function resolvePeriod(spec: PeriodSpec, now: Date = new Date()): PeriodSelection {
  const current = resolveCurrent(spec, now);
  const previous = resolvePrevious(spec, current, now);
  return {
    mode: previous ? spec.compare : "none",
    current,
    previous,
  };
}

// ─── wire format ─────────────────────────────────────────────────────────────

/**
 * `?start=…&end=…&cmp=wow&cmpStart=…&cmpEnd=…`
 *
 * Absolute dates, so a comparison URL is shareable and resolves identically for
 * every connector regardless of when in the day it is served.
 */
export function encodePeriod(spec: PeriodSpec, now: Date = new Date()): URLSearchParams {
  const sel = resolvePeriod(spec, now);
  const p = new URLSearchParams();
  p.set("start", sel.current.start);
  p.set("end", sel.current.end);
  p.set("cmp", sel.mode);
  if (sel.previous) {
    p.set("cmpStart", sel.previous.start);
    p.set("cmpEnd", sel.previous.end);
  }
  return p;
}

/**
 * Inverse of encodePeriod, plus a legacy `?days=N` alias.
 *
 * The legacy alias must keep working: /api/overview is called with `?days=` by
 * the report builders and both crons, and those must not silently gain a
 * comparison (which would double their outbound API calls).
 */
export function decodePeriod(sp: URLSearchParams): PeriodSpec {
  const start = parseISODate(sp.get("start"));
  const end = parseISODate(sp.get("end"));

  const rawCmp = sp.get("cmp");
  const compare: CompareMode = COMPARE_MODES.includes(rawCmp as CompareMode)
    ? (rawCmp as CompareMode)
    : "none";

  const cmpStart = parseISODate(sp.get("cmpStart"));
  const cmpEnd = parseISODate(sp.get("cmpEnd"));

  if (start && end && start <= end) {
    const preset = matchPreset({ start: toISO(start), end: toISO(end) });
    return {
      preset,
      customStart: preset === "custom" ? toISO(start) : undefined,
      customEnd: preset === "custom" ? toISO(end) : undefined,
      compare,
      compareStart: cmpStart ? toISO(cmpStart) : undefined,
      compareEnd: cmpEnd ? toISO(cmpEnd) : undefined,
    };
  }

  // Legacy `?days=N` — no comparison, matching the pre-feature behaviour.
  const days = Number(sp.get("days"));
  if (Number.isFinite(days) && days >= 1) {
    const clamped = Math.min(Math.max(Math.round(days), 1), MAX_WINDOW_DAYS);
    const preset = (PRESETS.find((p) => p === clamped) ?? "custom") as RangePreset;
    if (preset !== "custom") return { preset, compare: "none" };
    return { preset: 30, compare: "none" };
  }

  return { ...DEFAULT_PERIOD };
}

/** Collapses an explicit window back onto a preset when it happens to match one. */
function matchPreset(w: DateWindow): RangePreset {
  const days = windowDays(w);
  const hit = PRESETS.find((p) => p !== "custom" && p === days);
  return (hit ?? "custom") as RangePreset;
}

// ─── labels ──────────────────────────────────────────────────────────────────

const COMPARE_LABELS: Record<CompareMode, string> = {
  none: "no comparison",
  previous: "vs. previous period",
  wow: "vs. previous week",
  mom: "vs. previous month",
  yoy: "vs. previous year",
  custom: "vs. selected period",
};

export function comparisonLabel(mode: CompareMode): string {
  return COMPARE_LABELS[mode] ?? COMPARE_LABELS.none;
}

/**
 * "11 – 17 Aug 2026", "28 Feb – 3 Mar 2026", "20 Dec 2025 – 5 Jan 2026".
 *
 * Repeated month/year are dropped from the left side so the two windows in a
 * comparison label stay scannable side by side.
 */
function formatWindow(w: DateWindow): string {
  const s = parseISODate(w.start);
  const e = parseISODate(w.end);
  if (!s || !e) return "";

  const sameYear = s.getFullYear() === e.getFullYear();
  const sameMonth = sameYear && s.getMonth() === e.getMonth();

  if (sameMonth) return `${format(s, "d")} – ${format(e, "d MMM yyyy")}`;
  if (sameYear) return `${format(s, "d MMM")} – ${format(e, "d MMM yyyy")}`;
  return `${format(s, "d MMM yyyy")} – ${format(e, "d MMM yyyy")}`;
}

/**
 * Human summary, e.g. "11 – 17 Aug 2026 vs 4 – 10 Aug 2026".
 *
 * Always prints BOTH literal windows. For calendar modes the two can differ in
 * length, and showing only "month over month" would hide that.
 */
export function periodLabel(sel: PeriodSelection): string {
  const cur = formatWindow(sel.current);
  if (!sel.previous) return cur;
  return `${cur} vs ${formatWindow(sel.previous)}`;
}

/** Helper for connectors that still want a trailing-day count. */
export function windowToDays(w: DateWindow): number {
  return Math.max(1, windowDays(w));
}

/** Builds a trailing window of `days` ending today — the legacy call shape. */
export function trailingWindow(days: number, now: Date = new Date()): DateWindow {
  const n = Math.min(Math.max(Math.round(days), 1), MAX_WINDOW_DAYS);
  return { start: toISO(subDays(now, n - 1)), end: toISO(now) };
}

/** Exported for the cache key — see lib/dashboardCache.ts. */
export function periodCacheKey(sel: PeriodSelection): string {
  const prev = sel.previous ? `${sel.previous.start}_${sel.previous.end}` : "none";
  return `${sel.current.start}_${sel.current.end}|${prev}`;
}

/** Re-exported so callers need only one import. */
export { addDays };

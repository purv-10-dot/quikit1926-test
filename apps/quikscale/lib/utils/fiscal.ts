/** Quarter start months: Q1=Apr, Q2=Jul, Q3=Oct, Q4=Jan (next year) */
export const QUARTER_STARTS: Record<string, [number, number]> = {
  Q1: [3, 1],
  Q2: [6, 1],
  Q3: [9, 1],
  Q4: [0, 1],
};

export const ALL_QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;
/** Legacy default quarter length. */
export const DEFAULT_WEEKS_PER_QUARTER = 13;
/**
 * Upper bound for a custom quarter's week count (Custom Quarter Settings).
 * A real quarter is ~13 weeks; this is generous headroom that also bounds Zod
 * validation and API clamps so a malformed request can't create absurd grids.
 */
export const MAX_WEEKS_PER_QUARTER = 26;
/** `[1, 2, …, 13]` — the default 13-week list (legacy callers). */
export const ALL_WEEKS = Array.from({ length: DEFAULT_WEEKS_PER_QUARTER }, (_, i) => i + 1);
/** `[1, 2, …, count]` — the week list for a quarter of `count` weeks (default 13). */
export const weeksArray = (count: number = DEFAULT_WEEKS_PER_QUARTER): number[] =>
  Array.from({ length: count }, (_, i) => i + 1);
export const MEASUREMENT_UNITS = ["Number", "Percentage", "Currency"] as const;

/**
 * Weekly meeting day-name → JS `Date.getDay()` index (Sunday=0 … Saturday=6).
 * Used by Custom Quarter Settings' meeting-day week alignment.
 */
export const DAY_NAME_TO_INDEX: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

/**
 * Resolve a weekly meeting day-name (e.g. "Thursday") to its `getDay()` index,
 * or `null` when unset/unknown. A `null` result is the OFF signal — every
 * week-date helper falls back to the legacy calendar math when it sees null,
 * so Custom Quarter Settings being disabled changes nothing.
 */
export function meetingDayIndex(day: string | null | undefined): number | null {
  if (!day) return null;
  const idx = DAY_NAME_TO_INDEX[day];
  return idx === undefined ? null : idx;
}

/**
 * Custom Quarter Settings — meeting-day week alignment.
 *
 * Returns the first date on/after `quarterStart` whose weekday matches
 * `meetingDayIndex` (0=Sun…6=Sat). This is the anchor for Week 1 when a weekly
 * meeting day is configured: e.g. a quarter starting Wed 01 Apr with a Thursday
 * meeting day anchors to Thu 02 Apr, so every KPI/Priority week runs Thu→Wed.
 * If the quarter already starts on the meeting day, the same day is returned.
 *
 * The 0–6 leading days before the anchor belong to no week (per the spec's
 * example, where 01 Apr is not part of Week 1). Result is a fresh local-midnight
 * Date; the input is not mutated.
 */
export function alignToMeetingDay(quarterStart: Date, meetingDayIdx: number): Date {
  const d = new Date(quarterStart.getFullYear(), quarterStart.getMonth(), quarterStart.getDate());
  const diff = ((meetingDayIdx - d.getDay()) % 7 + 7) % 7;
  d.setDate(d.getDate() + diff);
  return d;
}

/** Current fiscal year (April-based). */
export function getFiscalYear(): number {
  const m = new Date().getMonth();
  return m >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
}

/** Current fiscal quarter — CALENDAR-based (Apr–Jun=Q1 … Jan–Mar=Q4).
 *  Ignores Custom Quarter Settings; for a custom-quarter-aware answer resolve
 *  from the tenant's QuarterSetting rows via `resolveQuarterForDate`. */
export function getFiscalQuarter(): "Q1" | "Q2" | "Q3" | "Q4" {
  const m = new Date().getMonth();
  if (m >= 3 && m <= 5) return "Q1";
  if (m >= 6 && m <= 8) return "Q2";
  if (m >= 9 && m <= 11) return "Q3";
  return "Q4";
}

/** A QuarterSetting row with the fields needed to test whether a date falls in it. */
export interface QuarterDateRow {
  quarter: string;
  startDate: string | Date;
  endDate: string | Date;
}

/** Parse an ISO string / Date to a local-midnight Date (no timezone drift). */
function toLocalDay(value: string | Date): Date {
  if (typeof value === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(value);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

/**
 * Resolve which quarter contains `now` from a tenant's QuarterSetting date
 * ranges — the Custom-Quarter-aware answer. Comparison is date-only and
 * inclusive on both ends (mirrors the Quarter Settings badge), so a quarter
 * whose custom length pushes its end past the calendar-month boundary (e.g. a
 * 14-week Q1 ending in July) still resolves correctly. Returns null when no row
 * contains `now` — callers can then fall back to the calendar `getFiscalQuarter`.
 */
export function resolveQuarterForDate(
  rows: QuarterDateRow[] | null | undefined,
  now: Date,
): "Q1" | "Q2" | "Q3" | "Q4" | null {
  if (!rows || rows.length === 0) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  for (const r of rows) {
    const s = toLocalDay(r.startDate).getTime();
    const e = toLocalDay(r.endDate).getTime();
    if (today >= s && today <= e) {
      const q = r.quarter;
      if (q === "Q1" || q === "Q2" || q === "Q3" || q === "Q4") return q;
    }
  }
  return null;
}

/** Formats "2026–2027" style label. */
export function fiscalYearLabel(year: number): string {
  return `${year}–${year + 1}`;
}

/**
 * Returns the start date of a fiscal quarter.
 *
 * If `actualStartDate` is provided (e.g. fetched from `QuarterSetting.startDate`),
 * that takes precedence — it lets us honour the tenant's real week-aligned
 * quarter start (typically the Monday on/before the 1st of the quarter's
 * first month) rather than the hardcoded calendar-month boundaries.
 *
 * Callers that don't have the actual start date can omit the third argument
 * and get the legacy calendar-month behavior (Q1=Apr 1, …, Q4=Jan 1).
 */
export function getQuarterStart(
  year: number,
  quarter: string,
  actualStartDate?: string | Date | null,
): Date {
  if (actualStartDate) {
    if (typeof actualStartDate === "string") {
      // Parse "YYYY-MM-DD" (or ISO) without timezone surprises: pull the
      // date parts directly so we get local-midnight on that calendar day.
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(actualStartDate);
      if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return new Date(actualStartDate);
    }
    return new Date(actualStartDate.getFullYear(), actualStartDate.getMonth(), actualStartDate.getDate());
  }
  const [mo, dy] = QUARTER_STARTS[quarter] ?? [3, 1];
  return new Date(quarter === "Q4" ? year + 1 : year, mo, dy);
}

/**
 * Returns the current fiscal week within the given quarter (legacy, uses
 * hardcoded months). Clamped to `[1, total]` — pass the quarter's `weekCount`
 * in Custom Quarter Settings mode (defaults to 13).
 */
export function getCurrentFiscalWeek(
  year: number,
  quarter: string,
  total: number = DEFAULT_WEEKS_PER_QUARTER,
): number {
  const now = new Date();
  const start = getQuarterStart(year, quarter);
  const elapsed = Math.floor((now.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return Math.min(total, Math.max(1, elapsed));
}

/**
 * Returns current fiscal week given a quarter's actual start date (ISO string or Date).
 * Use this when you have the real QuarterSetting.startDate from the DB. Clamped to
 * `[1, total]` — pass the quarter's `weekCount` (defaults to 13).
 */
export function getCurrentFiscalWeekFromStart(
  startDate: string | Date,
  total: number = DEFAULT_WEEKS_PER_QUARTER,
  meetingDay?: string | null,
  endDate?: string | Date | null,
  quarter?: string | null,
): number {
  const idx = meetingDayIndex(meetingDay);
  // Custom Quarter Settings + a known quarter end: find which meeting-day week
  // (including partial weeks) contains today, via the canonical generator.
  if (idx !== null && endDate != null) {
    const weeks = generateMeetingDayWeeks(startDate, endDate, idx, quarter === "Q1");
    if (weeks.length === 0) return 1;
    const now = toLocalDay(new Date()).getTime();
    if (now < weeks[0].start.getTime()) return 1;
    for (let i = 0; i < weeks.length; i++) {
      if (now <= weeks[i].end.getTime()) return i + 1;
    }
    return weeks.length;
  }
  // Legacy uniform-week fallback (meeting day off, or no quarter end supplied):
  // measure elapsed weeks from the start (or the meeting-day anchor).
  const start = typeof startDate === "string" ? new Date(startDate) : startDate;
  const anchor = idx !== null ? alignToMeetingDay(start, idx) : start;
  const now = new Date();
  if (now < anchor) return 1;
  const elapsed = Math.floor((now.getTime() - anchor.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return Math.min(total, Math.max(1, elapsed));
}

/**
 * QTD "reference week" — the value to pass to `computeQtd` as its `currentWeek`
 * so quarter-to-date counts the right number of COMPLETED weeks, accounting for
 * whether the quarter is past, current, or future relative to `now`:
 *
 *   - past   (now  >  quarter end)   → `weekCount + 1`  → QTD counts ALL weeks
 *                                       (the quarter is finished; nothing is
 *                                       "in progress" to exclude)
 *   - future (now  <  quarter start) → `1`              → QTD is 0
 *   - current                        → the elapsed week  → `computeQtd` excludes
 *                                       the in-progress week, as it does today
 *
 * This is what fixes a fully-past quarter showing QTD short by its final week:
 * `getCurrentFiscalWeekFromStart` clamps to `[1, weekCount]`, so a past quarter
 * reads as "week `weekCount`, in progress" and its last week is dropped from
 * QTD. Here a past quarter returns `weekCount + 1` instead.
 *
 * Differs from `getCurrentFiscalWeekFromStart` ONLY for past quarters — current
 * and future results are identical, so no other week math changes. Meeting-day
 * aware for the current-quarter elapsed calc (Custom Quarter Settings); works
 * with the toggle on OR off because past/future detection uses the quarter's
 * start/end dates, which always exist.
 */
export function qtdReferenceWeek(
  startDate: string | Date,
  endDate: string | Date,
  weekCount: number = DEFAULT_WEEKS_PER_QUARTER,
  now: Date = new Date(),
  meetingDay?: string | null,
  quarter?: string | null,
): number {
  const today = toLocalDay(now).getTime();
  const start = toLocalDay(startDate).getTime();
  const end = toLocalDay(endDate).getTime();
  if (today > end) return weekCount + 1;   // past → all weeks complete
  if (today < start) return 1;             // future → nothing started (QTD 0)
  return getCurrentFiscalWeekFromStart(startDate, weekCount, meetingDay, endDate, quarter);
}

/**
 * Custom Quarter Settings — the canonical week list for a quarter, aligned to
 * the weekly meeting day. THE single source of truth for both the stored
 * per-quarter `weekCount` and every displayed week range.
 *
 * Model: a single continuous chain of meeting-day weeks runs across the whole
 * fiscal year, anchored on the FY's first meeting day. Each quarter takes the
 * slice of that chain inside its [start, end], clipping any week that straddles
 * a quarter boundary. Per quarter this means:
 *   - regular weeks run meetingDay → meetingDay+6 (e.g. Thu → Wed);
 *   - if the quarter start is NOT a meeting day, the days from the start up to
 *     the first meeting day form a PARTIAL Week 1 (the tail of the previous
 *     quarter's straddling week) — EXCEPT the FY's first quarter (`dropLeading`),
 *     whose pre-chain days are left unassigned;
 *   - the final week is clipped to the quarter end (partial trailing week).
 * A quarter therefore has 13 or 14 weeks depending on its boundaries.
 *
 * `dropLeading` must be true ONLY for the fiscal year's first quarter (Q1) —
 * nothing precedes it, so its leading days are dropped rather than made a
 * partial Week 1. All dates are treated at local midnight; inputs are not
 * mutated. Returns [] when the range is empty/inverted.
 */
export function generateMeetingDayWeeks(
  quarterStart: string | Date,
  quarterEnd: string | Date,
  meetingDayIdx: number,
  dropLeading: boolean,
): Array<{ start: Date; end: Date }> {
  const qStart = toLocalDay(quarterStart);
  const qEnd = toLocalDay(quarterEnd);
  const weeks: Array<{ start: Date; end: Date }> = [];
  if (qEnd.getTime() < qStart.getTime()) return weeks;

  const addDaysLocal = (d: Date, n: number) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const firstMeeting = alignToMeetingDay(qStart, meetingDayIdx);

  let cursor: Date;
  if (firstMeeting.getTime() > qStart.getTime()) {
    if (!dropLeading) {
      // Leading partial week: [qStart .. day before the first meeting day].
      const pEnd = addDaysLocal(firstMeeting, -1);
      weeks.push({ start: qStart, end: pEnd.getTime() > qEnd.getTime() ? qEnd : pEnd });
    }
    cursor = firstMeeting; // Q1 (dropLeading) skips the pre-chain days entirely.
  } else {
    cursor = qStart; // quarter starts exactly on the meeting day
  }

  while (cursor.getTime() <= qEnd.getTime()) {
    const wEnd = addDaysLocal(cursor, 6);
    weeks.push({ start: cursor, end: wEnd.getTime() > qEnd.getTime() ? qEnd : wEnd });
    cursor = addDaysLocal(cursor, 7);
  }
  return weeks;
}

/**
 * Internal — compute the [start, end] Dates for one week of a quarter.
 *
 * When a `meetingDay` resolves to a weekday index AND a `quarterEnd` is known,
 * weeks come from `generateMeetingDayWeeks` (meeting-day aligned, partial weeks,
 * 13-or-14 count). When `meetingDay` is null/unset — Custom Quarter Settings off
 * — or no `quarterEnd` is supplied, this falls back to the legacy
 * `qStart + (week-1)*7 … +6` math, so nothing changes for non-custom tenants.
 */
function weekBounds(
  year: number,
  quarter: string,
  weekNumber: number,
  actualStartDate?: string | Date | null,
  meetingDay?: string | null,
  quarterEnd?: string | Date | null,
): { start: Date; end: Date } {
  const qs = getQuarterStart(year, quarter, actualStartDate);
  const idx = meetingDayIndex(meetingDay);
  if (idx !== null && quarterEnd != null) {
    const wk = generateMeetingDayWeeks(qs, quarterEnd, idx, quarter === "Q1")[weekNumber - 1];
    if (wk) return wk;
    // weekNumber past the last week → fall through to the uniform math below.
  }
  const start = new Date(qs.getFullYear(), qs.getMonth(), qs.getDate() + (weekNumber - 1) * 7);
  const end = new Date(qs.getFullYear(), qs.getMonth(), qs.getDate() + weekNumber * 7 - 1);
  return { start, end };
}

/**
 * Full-format date range: "1 Apr – 7 Apr".
 *
 * Pass `actualStartDate` (from `QuarterSetting.startDate`) to anchor weeks
 * on the tenant's real quarter start (typically the Monday on/before the
 * 1st of the quarter's first month). Without it, falls back to the legacy
 * calendar-month start.
 */
export function getWeekDateRange(
  year: number,
  quarter: string,
  weekNumber: number,
  actualStartDate?: string | Date | null,
  meetingDay?: string | null,
  quarterEnd?: string | Date | null,
): string {
  const { start, end } = weekBounds(year, quarter, weekNumber, actualStartDate, meetingDay, quarterEnd);
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${fmt(start)} – ${fmt(end)}`;
}

/**
 * Rolling window of week numbers for the dashboard preview.
 *
 * The window:
 *   - Includes the current week (it's NOT skipped — the dashboard cares
 *     about in-progress data too)
 *   - Falls back to `size` weeks starting at week 1 when the user is on a
 *     future quarter or early in a current quarter (so the grid is never
 *     just a single column).
 *
 * Examples (default size=5, total=13):
 *   - currentWeek=1  (future quarter)         → [1, 2, 3, 4, 5]
 *   - currentWeek=3  (early in current qtr)   → [1, 2, 3, 4, 5]
 *   - currentWeek=7  (mid current qtr)        → [3, 4, 5, 6, 7]
 *   - currentWeek=13 (past / completed qtr)   → [9, 10, 11, 12, 13]
 *
 * The previous implementation excluded the current week (`currentWeek - 1`),
 * which on past quarters hid week 13 — where all the data lives once a
 * quarter is finished. Dropping the `- 1` and using `Math.max(currentWeek,
 * size)` covers past, current, and future quarters with one formula.
 *
 * ⚠️ INTENTIONALLY includes the current week. Do NOT re-add a `- 1` here.
 * If a future caller needs to exclude the in-progress week for a specific
 * surface, slice the result IN THAT CALLER where the context is known —
 * don't bake the rule back into this helper (it has multiple callers with
 * different needs). See `__tests__/unit/fiscal.test.ts` — the
 * `rollingVisibleWeeks` block locks this contract in.
 *
 * Returns [] when `currentWeek` is null/undefined (still loading).
 */
export function rollingVisibleWeeks(
  currentWeek: number | null | undefined,
  size = 5,
  total = 13,
): number[] {
  if (currentWeek == null) return [];
  // `Math.max(currentWeek, size)` keeps the window at full width on early
  // weeks / future quarters; `Math.min(total, …)` caps at week `total`
  // so a past quarter (currentWeek=13) doesn't try to read beyond 13.
  const end = Math.min(total, Math.max(currentWeek, size));
  const start = Math.max(1, end - size + 1);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

/**
 * Compact date range for table headers: "1–7 Apr" or "29 Apr–5 May".
 *
 * Pass `actualStartDate` (from `QuarterSetting.startDate`) to anchor weeks
 * on the tenant's real quarter start. Without it, falls back to the legacy
 * calendar-month start.
 */
export function weekDateLabel(
  year: number,
  quarter: string,
  weekNumber: number,
  actualStartDate?: string | Date | null,
  meetingDay?: string | null,
  quarterEnd?: string | Date | null,
): string {
  const { start, end } = weekBounds(year, quarter, weekNumber, actualStartDate, meetingDay, quarterEnd);
  const startMonth = start.toLocaleDateString("en-GB", { month: "short" });
  const endMonth = end.toLocaleDateString("en-GB", { month: "short" });
  if (startMonth === endMonth) {
    return `${start.getDate()}–${end.getDate()} ${startMonth}`;
  }
  return `${start.getDate()} ${startMonth}–${end.getDate()} ${endMonth}`;
}

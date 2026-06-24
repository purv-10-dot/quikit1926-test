/**
 * habitQuarterPeriod — pure helpers for the Habits "New Assessment" modal.
 *
 * The modal is now mapped onto the tenant's real Quarter Settings
 * (`QuarterSetting` rows, surfaced via `useQuarterStartDates`). Each quarter
 * card is classified as past / current / future from its configured
 * start/end dates, and whether a *past* quarter can be selected depends on
 * the `add_past_quarter_habit` feature flag.
 *
 * Kept free of React/DB so it can be unit-tested directly and reused by the
 * server-side gate in `POST /api/habits`.
 */

export type QuarterPeriodStatus = "past" | "current" | "future";

/**
 * Parse a `YYYY-MM-DD` string (or Date) to **local midnight** of that calendar
 * day — mirrors `getQuarterStart` in `fiscal.ts` so we avoid the UTC-midnight
 * → previous-day surprise for callers in +TZ offsets.
 */
function toLocalMidnight(d: string | Date): Date {
  if (typeof d === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const parsed = new Date(d);
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Classify a configured quarter by its date range relative to `today`.
 *
 * Comparison is **date-only** (end-of-day inclusive): a quarter counts as
 * "past" only once today is strictly after its `endDate` calendar day, and
 * "future" only while today is strictly before its `startDate` calendar day.
 * On the start day, end day, or any day in between it is "current".
 */
export function getQuarterPeriodStatus(
  startDate: string | Date,
  endDate: string | Date,
  today: Date = new Date(),
): QuarterPeriodStatus {
  const start = toLocalMidnight(startDate);
  const end = toLocalMidnight(endDate);
  const now = toLocalMidnight(today);

  if (now.getTime() > end.getTime()) return "past";
  if (now.getTime() < start.getTime()) return "future";
  return "current";
}

/**
 * Whether a quarter card may be selected in the modal. Past quarters are
 * locked unless the `add_past_quarter_habit` flag is on; current and future
 * quarters are always selectable.
 */
export function isQuarterSelectable({
  status,
  canAddPastQuarter,
}: {
  status: QuarterPeriodStatus;
  canAddPastQuarter: boolean;
}): boolean {
  return status !== "past" || canAddPastQuarter;
}

/**
 * Display label for a configured quarter's real range, e.g. "30 Mar – 29 Jun
 * 2026". Follows the `en-GB` `day`/`month: short` formatting used elsewhere
 * in `fiscal.ts`. The year is shown once (on the end), or on both ends when
 * the range straddles a calendar-year boundary (e.g. Q4 "30 Dec 2026 – 29 Mar
 * 2027").
 */
export function formatQuarterDateRange(
  startDate: string | Date,
  endDate: string | Date,
): string {
  const start = toLocalMidnight(startDate);
  const end = toLocalMidnight(endDate);
  const dayMonth = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  if (start.getFullYear() === end.getFullYear()) {
    return `${dayMonth(start)} – ${dayMonth(end)} ${end.getFullYear()}`;
  }
  return `${dayMonth(start)} ${start.getFullYear()} – ${dayMonth(end)} ${end.getFullYear()}`;
}

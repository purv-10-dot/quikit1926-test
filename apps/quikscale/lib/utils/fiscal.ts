/** Quarter start months: Q1=Apr, Q2=Jul, Q3=Oct, Q4=Jan (next year) */
export const QUARTER_STARTS: Record<string, [number, number]> = {
  Q1: [3, 1],
  Q2: [6, 1],
  Q3: [9, 1],
  Q4: [0, 1],
};

export const ALL_QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;
export const ALL_WEEKS = Array.from({ length: 13 }, (_, i) => i + 1);
export const MEASUREMENT_UNITS = ["Number", "Percentage", "Currency"] as const;

/** Current fiscal year (April-based). */
export function getFiscalYear(): number {
  const m = new Date().getMonth();
  return m >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
}

/** Current fiscal quarter. */
export function getFiscalQuarter(): "Q1" | "Q2" | "Q3" | "Q4" {
  const m = new Date().getMonth();
  if (m >= 3 && m <= 5) return "Q1";
  if (m >= 6 && m <= 8) return "Q2";
  if (m >= 9 && m <= 11) return "Q3";
  return "Q4";
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

/** Returns the current fiscal week (1–13) within the given quarter (legacy, uses hardcoded months). */
export function getCurrentFiscalWeek(year: number, quarter: string): number {
  const now = new Date();
  const start = getQuarterStart(year, quarter);
  const elapsed = Math.floor((now.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return Math.min(13, Math.max(1, elapsed));
}

/**
 * Returns current fiscal week given a quarter's actual start date (ISO string or Date).
 * Use this when you have the real QuarterSetting.startDate from the DB.
 */
export function getCurrentFiscalWeekFromStart(startDate: string | Date): number {
  const start = typeof startDate === "string" ? new Date(startDate) : startDate;
  const now = new Date();
  if (now < start) return 1;
  const elapsed = Math.floor((now.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return Math.min(13, Math.max(1, elapsed));
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
): string {
  const qs = getQuarterStart(year, quarter, actualStartDate);
  const start = new Date(qs.getFullYear(), qs.getMonth(), qs.getDate() + (weekNumber - 1) * 7);
  const end = new Date(qs.getFullYear(), qs.getMonth(), qs.getDate() + weekNumber * 7 - 1);
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
): string {
  const qs = getQuarterStart(year, quarter, actualStartDate);
  const start = new Date(qs.getFullYear(), qs.getMonth(), qs.getDate() + (weekNumber - 1) * 7);
  const end = new Date(qs.getFullYear(), qs.getMonth(), qs.getDate() + weekNumber * 7 - 1);
  const startMonth = start.toLocaleDateString("en-GB", { month: "short" });
  const endMonth = end.toLocaleDateString("en-GB", { month: "short" });
  if (startMonth === endMonth) {
    return `${start.getDate()}–${end.getDate()} ${startMonth}`;
  }
  return `${start.getDate()} ${startMonth}–${end.getDate()} ${endMonth}`;
}

/**
 * Pure helpers for fiscal-quarter date generation.
 *
 * Extracted from `app/api/org/quarters/route.ts` so the day-count splitting
 * math can be unit-tested in isolation (route was 314 lines with three
 * flavours of date arithmetic inline — flagged as §7 item 6 in
 * code-analysis-full.md).
 *
 * All math is UTC-normalized. No timezone drift.
 */

export interface QuarterDateRow {
  quarter: "Q1" | "Q2" | "Q3" | "Q4";
  startDate: Date;
  endDate: Date;
  /** Custom Quarter Settings: weeks in this quarter. Omitted = legacy 13. */
  weekCount?: number;
}

/** True for leap years in the proleptic Gregorian calendar. */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Returns a new Date offset by `days` (positive or negative) in UTC. */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/** Integer day difference b - a (both inclusive endpoints are caller's call). */
export function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * Whether the inclusive range [fyStart, fyEnd] contains a Feb 29.
 * Iterates per-year so multi-year ranges are supported correctly.
 */
export function fyContainsLeapDay(fyStart: Date, fyEnd: Date): boolean {
  const startYear = fyStart.getUTCFullYear();
  const endYear = fyEnd.getUTCFullYear();
  for (let y = startYear; y <= endYear; y++) {
    if (isLeapYear(y)) {
      const feb29 = new Date(Date.UTC(y, 1, 29));
      if (feb29 >= fyStart && feb29 <= fyEnd) return true;
    }
  }
  return false;
}

/**
 * Given a fiscal year and start month, compute the inclusive [start, end]
 * date range for the fiscal year in UTC.
 *
 * - `fiscalStartMonth` is 1-12 (1=Jan, 4=Apr).
 * - If `fyStartDate` is provided, its Y/M/D is used as the start; otherwise
 *   the 1st of `fiscalStartMonth` in `fiscalYear` is used.
 * - FY end = start + 1 year − 1 day (always inclusive).
 */
export function computeFiscalYearRange(
  fiscalYear: number,
  fiscalStartMonth: number,
  fyStartDate?: Date,
): { fyStart: Date; fyEnd: Date } {
  const fyStart = fyStartDate
    ? new Date(
        Date.UTC(
          fyStartDate.getUTCFullYear(),
          fyStartDate.getUTCMonth(),
          fyStartDate.getUTCDate(),
        ),
      )
    : new Date(Date.UTC(fiscalYear, fiscalStartMonth - 1, 1));

  const fyEnd = addDays(
    new Date(
      Date.UTC(fyStart.getUTCFullYear() + 1, fyStart.getUTCMonth(), fyStart.getUTCDate()),
    ),
    -1,
  );

  return { fyStart, fyEnd };
}

/**
 * Generate the 4 fiscal quarters for a fiscal year using day-count splitting.
 *
 * Distribution: Q1=91, Q2=91, Q3=91, Q4=92 (or 93 if the fiscal year contains
 * a leap day). This keeps Q1-Q3 identical every year so week/cell math in
 * the KPI view stays stable; leap days only affect Q4.
 *
 * Sum of days is always exactly 365 or 366.
 */
export function generateQuarterDates(
  fiscalYear: number,
  fiscalStartMonth: number,
  fyStartDate?: Date,
): QuarterDateRow[] {
  const { fyStart, fyEnd } = computeFiscalYearRange(
    fiscalYear,
    fiscalStartMonth,
    fyStartDate,
  );

  const totalDays = diffDays(fyStart, fyEnd) + 1;
  const hasLeap = totalDays === 366;

  const dayDistribution: [number, number, number, number] = [
    91,
    91,
    91,
    hasLeap ? 93 : 92,
  ];
  const quarterNames: Array<QuarterDateRow["quarter"]> = ["Q1", "Q2", "Q3", "Q4"];

  const quarters: QuarterDateRow[] = [];
  let cursor = new Date(fyStart.getTime());

  for (let i = 0; i < 4; i++) {
    const qStart = new Date(cursor.getTime());
    const qEnd = addDays(qStart, dayDistribution[i] - 1);
    quarters.push({
      quarter: quarterNames[i],
      startDate: qStart,
      endDate: qEnd,
    });
    cursor = addDays(qEnd, 1);
  }

  return quarters;
}

/**
 * Add `months` to a UTC date, clamping the day-of-month to the target month's
 * length so the result never overflows into the following month.
 *
 *   addMonthsUTC(2026-01-31, 1) → 2026-02-28  (NOT 2026-03-03)
 *   addMonthsUTC(2024-02-29, 12) → 2025-02-28 (leap → non-leap clamp)
 *
 * `Date.setUTCMonth` alone would roll 31 Jan + 1 month over to 03 Mar; this
 * clamps to the last valid day instead.
 */
export function addMonthsUTC(date: Date, months: number): Date {
  const y = date.getUTCFullYear();
  const mAbs = date.getUTCMonth() + months;
  const targetYear = y + Math.floor(mAbs / 12);
  const targetMonth = ((mAbs % 12) + 12) % 12;
  const day = date.getUTCDate();
  // Day 0 of month+1 is the last day of the target month.
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay)));
}

/**
 * Custom Quarter Settings (month-based): build the 4 quarters on calendar
 * 3-month intervals anchored on the Q1 start date. Each quarter starts exactly
 * 3/6/9 months after Q1 (anchored on Q1, NOT chained from the previous quarter,
 * so a clamped month-end like 30/11 → 28/02 recovers to the 30th afterwards
 * instead of drifting permanently). Each quarter ends the day before the next
 * begins; the fiscal year always ends on `Q1 start + 12 months − 1 day`, so the
 * total is always exactly 365/366 days and every boundary lands on a calendar
 * month edge — fixing the "1 day missing" (weeks×7 = 364) and month-drift bugs
 * of `chainQuarterDates`.
 *
 * `weekCount` is persisted as 13 for all quarters so the KPI weekly grid stays
 * 13 columns; the 1–2 trailing days of a 92-day quarter fold into week 13 via
 * the existing clamp in `getCurrentFiscalWeekFromStart`. All math is UTC-safe.
 */
export function generateMonthlyQuarterDates(q1Start: Date): QuarterDateRow[] {
  const names: Array<QuarterDateRow["quarter"]> = ["Q1", "Q2", "Q3", "Q4"];
  const anchor = new Date(
    Date.UTC(q1Start.getUTCFullYear(), q1Start.getUTCMonth(), q1Start.getUTCDate()),
  );

  // Starts anchored on Q1 (0, 3, 6, 9 months) — avoids compounding clamp drift.
  const starts = [0, 3, 6, 9].map((m) => addMonthsUTC(anchor, m));
  const fyEnd = addDays(addMonthsUTC(anchor, 12), -1); // Q1 start + 1yr − 1 day

  return names.map((quarter, i) => ({
    quarter,
    startDate: starts[i],
    endDate: i < 3 ? addDays(starts[i + 1], -1) : fyEnd,
    weekCount: 13,
  }));
}

/**
 * Custom Quarter mode picks its generator from the per-quarter week counts:
 *  - all four = 13 (the default) → month-based calendar quarters (365/366 days)
 *  - any quarter ≠ 13            → week-based chained quarters (weekCount × 7)
 *
 * An all-13 *week-based* year is only 364 days (the original "1 day missing"
 * bug), which nobody wants — so all-13 always maps to the clean calendar year,
 * and a user opts into literal week lengths by setting a quarter to something
 * other than 13. A missing/malformed list defaults to month-based.
 *
 * Used on both the POST path (from the request body) and the PUT recalculation
 * (from the persisted counts, with the edit applied) so the client preview,
 * POST, and PUT always agree.
 */
export function isMonthBasedWeekCounts(weekCounts?: number[] | null): boolean {
  if (!weekCounts || weekCounts.length !== 4) return true;
  return weekCounts.every((w) => w === 13);
}

/**
 * Custom Quarter Settings: build the 4 contiguous quarters from a Q1 start date
 * and an explicit per-quarter week count. Each quarter spans `weekCount × 7`
 * days; the next quarter starts the day after the previous ends. Unlike
 * `generateQuarterDates`, the fiscal year is NOT pinned to 365/366 days — its
 * length floats to the sum of the quarters' weeks.
 *
 * Used for the week-based Custom sub-mode (any quarter ≠ 13 weeks — see
 * `isMonthBasedWeekCounts`). `weekCounts` must have length 4 (Q1..Q4). All math
 * is UTC-normalized.
 */
export function chainQuarterDates(
  q1Start: Date,
  weekCounts: number[],
): QuarterDateRow[] {
  const names: Array<QuarterDateRow["quarter"]> = ["Q1", "Q2", "Q3", "Q4"];
  const rows: QuarterDateRow[] = [];
  let cursor = new Date(
    Date.UTC(q1Start.getUTCFullYear(), q1Start.getUTCMonth(), q1Start.getUTCDate()),
  );

  for (let i = 0; i < 4; i++) {
    const weeks = weekCounts[i] ?? 13;
    const qStart = new Date(cursor.getTime());
    const qEnd = addDays(qStart, weeks * 7 - 1);
    rows.push({ quarter: names[i], startDate: qStart, endDate: qEnd, weekCount: weeks });
    cursor = addDays(qEnd, 1);
  }

  return rows;
}

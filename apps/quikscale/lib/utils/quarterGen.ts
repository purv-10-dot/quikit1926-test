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

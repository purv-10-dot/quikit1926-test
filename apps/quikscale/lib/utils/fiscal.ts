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

/** Returns the start date of a fiscal quarter. */
export function getQuarterStart(year: number, quarter: string): Date {
  const [mo, dy] = QUARTER_STARTS[quarter] ?? [3, 1];
  return new Date(quarter === "Q4" ? year + 1 : year, mo, dy);
}

/** Returns the current fiscal week (1–13) within the given quarter. */
export function getCurrentFiscalWeek(year: number, quarter: string): number {
  const now = new Date();
  const start = getQuarterStart(year, quarter);
  const elapsed = Math.floor((now.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return Math.min(13, Math.max(1, elapsed));
}

/** Full-format date range: "1 Apr – 7 Apr" */
export function getWeekDateRange(year: number, quarter: string, weekNumber: number): string {
  const [mo, dy] = QUARTER_STARTS[quarter] ?? [3, 1];
  const yr = quarter === "Q4" ? year + 1 : year;
  const start = new Date(yr, mo, dy + (weekNumber - 1) * 7);
  const end = new Date(yr, mo, dy + weekNumber * 7 - 1);
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${fmt(start)} – ${fmt(end)}`;
}

/** Compact date range for table headers: "1–7 Apr" or "29 Apr–5 May" */
export function weekDateLabel(year: number, quarter: string, weekNumber: number): string {
  const [mo, dy] = QUARTER_STARTS[quarter] ?? [3, 1];
  const yr = quarter === "Q4" ? year + 1 : year;
  const start = new Date(yr, mo, dy + (weekNumber - 1) * 7);
  const end = new Date(yr, mo, dy + weekNumber * 7 - 1);
  const startMonth = start.toLocaleDateString("en-GB", { month: "short" });
  const endMonth = end.toLocaleDateString("en-GB", { month: "short" });
  if (startMonth === endMonth) {
    return `${start.getDate()}–${end.getDate()} ${startMonth}`;
  }
  return `${start.getDate()} ${startMonth}–${end.getDate()} ${endMonth}`;
}

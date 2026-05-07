/**
 * Date-math helpers for the timesheet view. All functions return calendar
 * dates in the local TZ — the timesheet is day-granular, so converting to
 * UTC just creates DST surprises.
 */

export type Period = "week" | "month" | "quarter";

export interface PeriodRange {
  from: Date;
  to: Date;
  /** Days inclusive — used to render column headers. */
  days: Date[];
  label: string;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

function fmtMonthDay(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Build a range covering the given period anchored at `anchor`. */
export function getPeriodRange(period: Period, anchor: Date): PeriodRange {
  const a = startOfDay(anchor);
  let from: Date;
  let to: Date;
  if (period === "week") {
    // Monday-anchored week.
    const dow = (a.getDay() + 6) % 7;
    from = addDays(a, -dow);
    to = addDays(from, 6);
  } else if (period === "month") {
    from = new Date(a.getFullYear(), a.getMonth(), 1);
    to = new Date(a.getFullYear(), a.getMonth() + 1, 0);
  } else {
    const q = Math.floor(a.getMonth() / 3);
    from = new Date(a.getFullYear(), q * 3, 1);
    to = new Date(a.getFullYear(), q * 3 + 3, 0);
  }
  const days: Date[] = [];
  for (let d = new Date(from); d <= to; d = addDays(d, 1)) days.push(new Date(d));
  let label: string;
  if (period === "week") {
    label = `${fmtMonthDay(from)} – ${fmtMonthDay(to)}, ${to.getFullYear()}`;
  } else if (period === "month") {
    label = a.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  } else {
    label = `Q${Math.floor(a.getMonth() / 3) + 1} ${a.getFullYear()}`;
  }
  return { from, to, days, label };
}

/** Move the anchor by one period. */
export function shiftAnchor(period: Period, anchor: Date, dir: -1 | 1): Date {
  if (period === "week") return addDays(anchor, 7 * dir);
  if (period === "month") return addMonths(anchor, dir);
  return addMonths(anchor, 3 * dir);
}

/** YYYY-MM-DD key for cell maps — must match the API's `dateKey()`. */
export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "0m", "30m", "1h", "1h 30m", "8h 15m" — matches Jira/Tempo formatting. */
export function formatHours(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "-";
  const minutes = Math.round(hours * 60);
  const h = Math.floor(minutes / 60);
  const m = minutes - h * 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/** Same parser as the issue-activity log-time modal. */
export function parseDurationToHours(input: string): number | null {
  let total = 0;
  let matched = false;
  for (const m of input.matchAll(/(\d+(?:\.\d+)?)\s*([wdhm])/gi)) {
    matched = true;
    const value = Number(m[1]);
    const unit = m[2]!.toLowerCase();
    if (unit === "w") total += value * 5 * 8;
    else if (unit === "d") total += value * 8;
    else if (unit === "h") total += value;
    else if (unit === "m") total += value / 60;
  }
  // Bare number → hours.
  if (!matched && /^\s*\d+(\.\d+)?\s*$/.test(input)) {
    matched = true;
    total = Number(input.trim());
  }
  return matched ? total : null;
}

export function isWeekend(d: Date): boolean {
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

export function isToday(d: Date): boolean {
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

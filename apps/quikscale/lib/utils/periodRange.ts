/**
 * Pure day/week/month/all period helpers backing the WWW module's due-date
 * range nav (Day / Week / Month / All toggle + step arrows).
 *
 * String in, string out — no `Date.now()`/ambient `new Date()` reads — so
 * these are trivially unit-testable and safe to call from workflow scripts
 * or server code alike. Dates are always "YYYY-MM-DD" (the native
 * `<input type="date">` value shape, see `toDateInputValue` in `dateUtils.ts`).
 *
 * Weeks are Monday–Sunday, matching the ISO week convention.
 */

export type PeriodView = "day" | "week" | "month" | "all";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Parses a "YYYY-MM-DD" string into a UTC midnight Date (avoids local-tz drift). */
function parseAnchor(anchorDate: string): Date {
  const [y, m, d] = anchorDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Monday of the ISO week containing `d`. */
function startOfWeek(d: Date): Date {
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diffToMonday);
  return monday;
}

function endOfMonth(y: number, m0: number): Date {
  // Day 0 of the next month = last day of this month.
  return new Date(Date.UTC(y, m0 + 1, 0));
}

export function getPeriodRange(view: PeriodView, anchorDate: string): { from?: string; to?: string } {
  if (view === "all") return {};
  const d = parseAnchor(anchorDate);
  if (view === "day") {
    const ymd = formatYmd(d);
    return { from: ymd, to: ymd };
  }
  if (view === "week") {
    const monday = startOfWeek(d);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    return { from: formatYmd(monday), to: formatYmd(sunday) };
  }
  // month
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const last = endOfMonth(d.getUTCFullYear(), d.getUTCMonth());
  return { from: formatYmd(first), to: formatYmd(last) };
}

export function getPeriodLabel(view: PeriodView, anchorDate: string): string {
  if (view === "all") return "";
  const d = parseAnchor(anchorDate);
  const year = d.getUTCFullYear();
  const monthName = MONTH_NAMES[d.getUTCMonth()];

  if (view === "month") return `${monthName} ${year}`;

  if (view === "day") {
    const weekday = WEEKDAY_NAMES[d.getUTCDay()];
    return `${weekday}, ${d.getUTCDate()} ${monthName} ${year}`;
  }

  // week
  const monday = startOfWeek(d);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const startMonth = MONTH_NAMES[monday.getUTCMonth()];
  const endMonth = MONTH_NAMES[sunday.getUTCMonth()];
  const endYear = sunday.getUTCFullYear();
  if (startMonth === endMonth && monday.getUTCFullYear() === endYear) {
    return `${monday.getUTCDate()} – ${sunday.getUTCDate()} ${endMonth} ${endYear}`;
  }
  if (monday.getUTCFullYear() === endYear) {
    return `${monday.getUTCDate()} ${startMonth} – ${sunday.getUTCDate()} ${endMonth} ${endYear}`;
  }
  return `${monday.getUTCDate()} ${startMonth} ${monday.getUTCFullYear()} – ${sunday.getUTCDate()} ${endMonth} ${endYear}`;
}

export function stepAnchorDate(view: PeriodView, anchorDate: string, direction: 1 | -1): string {
  if (view === "all") return anchorDate;
  const d = parseAnchor(anchorDate);
  if (view === "day") {
    d.setUTCDate(d.getUTCDate() + direction);
    return formatYmd(d);
  }
  if (view === "week") {
    d.setUTCDate(d.getUTCDate() + direction * 7);
    return formatYmd(d);
  }
  // month — clamp the day-of-month into the target month so e.g. Jan 31 + 1
  // month lands on Feb 28/29 instead of silently rolling into March.
  const targetMonthIndex = d.getUTCMonth() + direction;
  const targetYear = d.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDayOfTargetMonth = endOfMonth(targetYear, normalizedMonth).getUTCDate();
  const day = Math.min(d.getUTCDate(), lastDayOfTargetMonth);
  return formatYmd(new Date(Date.UTC(targetYear, normalizedMonth, day)));
}

/**
 * Business-period date resolver for the executive report.
 *
 * The report needs to answer questions like:
 *   - "Show me Q2 of 2024"
 *   - "Show me last month"
 *   - "Show me from 2024-01-15 to 2024-03-15"
 *
 * Range presets resolve to a concrete [from, to) pair using the org's
 * fiscal `quarterStartMonth` (Org.quarterStartMonth: 1 = Jan, 4 = Apr, etc.).
 * All dates are UTC to keep buckets stable across the user's timezone.
 */

import { startOfISOWeek } from "./weekly";

export type RangePreset =
  | "this-week"
  | "last-week"
  | "this-month"
  | "last-month"
  | "this-quarter"
  | "last-quarter"
  | "this-year"
  | "last-year"
  | "ytd"
  | "last-30"
  | "last-90"
  | "last-180"
  | "last-365"
  | "specific-quarter"
  | "specific-month"
  | "specific-year"
  | "custom";

export type CompareMode = "none" | "previous-period" | "previous-year";

export interface ResolvedRange {
  /** UTC start, inclusive. */
  from: Date;
  /** UTC end, exclusive. */
  to: Date;
  /** Human label like "Q2 2024" or "Mar 1 – Mar 31, 2024". */
  label: string;
  /** Length in days for the comparison-period calculation. */
  days: number;
}

export interface ResolveOptions {
  /** `Org.quarterStartMonth` — 1 (Jan) to 12. Defaults to 1 (calendar year). */
  quarterStartMonth?: number;
  /** When the preset needs an anchor year (specific-quarter, specific-month, etc). */
  year?: number;
  /** When preset = "specific-quarter": which quarter (1..4) of the chosen year. */
  quarter?: number;
  /** When preset = "specific-month": 1..12. */
  month?: number;
  /** When preset = "custom": ISO YYYY-MM-DD inclusive. */
  customFrom?: string;
  /** When preset = "custom": ISO YYYY-MM-DD inclusive (we add 1 day for the exclusive end). */
  customTo?: string;
  /** "Now" override for tests. */
  now?: Date;
}

const MS_DAY = 24 * 60 * 60 * 1000;

export function resolveRange(preset: RangePreset, opts: ResolveOptions = {}): ResolvedRange {
  const now = opts.now ?? new Date();
  const quarterStart = clamp(opts.quarterStartMonth ?? 1, 1, 12);

  switch (preset) {
    case "this-week": {
      const from = startOfISOWeek(now);
      const to = addDays(from, 7);
      return labelled(from, to, formatWeekLabel(from));
    }
    case "last-week": {
      const thisWeek = startOfISOWeek(now);
      const from = addDays(thisWeek, -7);
      const to = thisWeek;
      return labelled(from, to, `Last week (${formatWeekLabel(from)})`);
    }
    case "this-month": {
      const from = startOfMonthUTC(now);
      const to = addMonths(from, 1);
      return labelled(from, to, formatMonth(from));
    }
    case "last-month": {
      const thisMonth = startOfMonthUTC(now);
      const from = addMonths(thisMonth, -1);
      return labelled(from, thisMonth, formatMonth(from));
    }
    case "this-quarter": {
      const { from, to } = quarterContaining(now, quarterStart);
      return labelled(from, to, formatQuarter(from, quarterStart));
    }
    case "last-quarter": {
      const { from } = quarterContaining(now, quarterStart);
      const prevFrom = addMonths(from, -3);
      return labelled(prevFrom, from, formatQuarter(prevFrom, quarterStart));
    }
    case "this-year": {
      const from = startOfYearUTC(now);
      const to = addYears(from, 1);
      return labelled(from, to, String(from.getUTCFullYear()));
    }
    case "last-year": {
      const thisYear = startOfYearUTC(now);
      const from = addYears(thisYear, -1);
      return labelled(from, thisYear, String(from.getUTCFullYear()));
    }
    case "ytd": {
      const from = startOfYearUTC(now);
      const to = nextDayStartUTC(now);
      return labelled(from, to, `YTD ${from.getUTCFullYear()}`);
    }
    case "last-30":
      return rollingDays(now, 30, "Last 30 days");
    case "last-90":
      return rollingDays(now, 90, "Last 90 days");
    case "last-180":
      return rollingDays(now, 180, "Last 180 days");
    case "last-365":
      return rollingDays(now, 365, "Last 12 months");
    case "specific-quarter": {
      const year = opts.year ?? now.getUTCFullYear();
      const q = clamp(opts.quarter ?? 1, 1, 4);
      const from = quarterStartDate(year, q, quarterStart);
      const to = addMonths(from, 3);
      return labelled(from, to, formatQuarter(from, quarterStart));
    }
    case "specific-month": {
      const year = opts.year ?? now.getUTCFullYear();
      const month = clamp(opts.month ?? 1, 1, 12);
      const from = new Date(Date.UTC(year, month - 1, 1));
      const to = addMonths(from, 1);
      return labelled(from, to, formatMonth(from));
    }
    case "specific-year": {
      const year = opts.year ?? now.getUTCFullYear();
      const from = new Date(Date.UTC(year, 0, 1));
      const to = new Date(Date.UTC(year + 1, 0, 1));
      return labelled(from, to, String(year));
    }
    case "custom": {
      if (!opts.customFrom || !opts.customTo) {
        // Sensible fallback so the chart never explodes — default to last 30 days.
        return rollingDays(now, 30, "Last 30 days");
      }
      const from = parseIsoUTC(opts.customFrom);
      const to = addDays(parseIsoUTC(opts.customTo), 1);
      return labelled(from, to, `${formatDateLong(from)} – ${formatDateLong(addDays(to, -1))}`);
    }
  }
}

export function resolveCompareRange(
  range: ResolvedRange,
  mode: CompareMode,
): ResolvedRange | null {
  if (mode === "none") return null;
  if (mode === "previous-year") {
    return labelled(
      addYears(range.from, -1),
      addYears(range.to, -1),
      `Same period in ${range.from.getUTCFullYear() - 1}`,
    );
  }
  // previous-period — same length immediately before
  const to = range.from;
  const from = new Date(to.getTime() - (range.to.getTime() - range.from.getTime()));
  return labelled(from, to, "Previous period");
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * MS_DAY);
}

function addMonths(d: Date, months: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate()));
}

function addYears(d: Date, years: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear() + years, d.getUTCMonth(), d.getUTCDate()));
}

function startOfMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function startOfYearUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
}

function nextDayStartUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
}

function parseIsoUTC(s: string): Date {
  // Accept YYYY-MM-DD; force UTC midnight.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return new Date(s); // fallback to native parse
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function rollingDays(now: Date, days: number, label: string): ResolvedRange {
  const to = nextDayStartUTC(now);
  const from = addDays(to, -days);
  return labelled(from, to, label);
}

function quarterContaining(now: Date, quarterStart: number): { from: Date; to: Date } {
  // Months in the fiscal year, ordered. Quarter index = floor of months-since-fiscal-start / 3.
  const m = now.getUTCMonth(); // 0..11
  const monthsSinceStart = (m - (quarterStart - 1) + 12) % 12;
  const qIdx = Math.floor(monthsSinceStart / 3);
  const yearOffset = m < quarterStart - 1 ? -1 : 0;
  const from = new Date(
    Date.UTC(now.getUTCFullYear() + yearOffset, quarterStart - 1 + qIdx * 3, 1),
  );
  const to = addMonths(from, 3);
  return { from, to };
}

function quarterStartDate(fiscalYear: number, quarter: number, quarterStart: number): Date {
  // For a fiscal year that begins in `quarterStart` (e.g. 4 = Apr), Q1 starts
  // at month `quarterStart` of `fiscalYear`. The calendar year may roll over
  // for later quarters of a non-Jan fiscal year.
  const startMonth = quarterStart - 1 + (quarter - 1) * 3; // 0-indexed, may exceed 11
  const yearOffset = Math.floor(startMonth / 12);
  return new Date(Date.UTC(fiscalYear + yearOffset, startMonth % 12, 1));
}

function labelled(from: Date, to: Date, label: string): ResolvedRange {
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / MS_DAY));
  return { from, to, label, days };
}

function formatMonth(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function formatDateLong(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function formatWeekLabel(d: Date): string {
  const end = addDays(d, 6);
  if (d.getUTCMonth() === end.getUTCMonth()) {
    return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}–${end.getUTCDate()}, ${d.getUTCFullYear()}`;
  }
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}, ${end.getUTCFullYear()}`;
}

function formatQuarter(from: Date, quarterStart: number): string {
  // Compute fiscal-quarter index relative to quarterStart.
  const m = from.getUTCMonth();
  const monthsSinceStart = (m - (quarterStart - 1) + 12) % 12;
  const qIdx = Math.floor(monthsSinceStart / 3) + 1;
  // The fiscal year label is the calendar year of `from` adjusted backward when
  // `from` predates this calendar year's fiscal start.
  const fiscalYear = m < quarterStart - 1 ? from.getUTCFullYear() - 1 : from.getUTCFullYear();
  return `Q${qIdx} ${fiscalYear}${quarterStart === 1 ? "" : " (FY)"}`;
}

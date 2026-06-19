/**
 * Date/bucketing helpers for the executive weekly-trend report. ISO weeks
 * (Monday start, 00:00 UTC) are used so cells line up regardless of the
 * caller's locale or DST offset.
 */

export interface WeekBucket {
  /** ISO date (yyyy-mm-dd) of the Monday that starts the week. */
  weekStart: string;
  /** Short display label (e.g. "May 25"). */
  weekLabel: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function startOfISOWeek(d: Date): Date {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = dt.getUTCDay(); // 0 = Sun, 1 = Mon, ... 6 = Sat
  const offset = day === 0 ? -6 : 1 - day; // shift to Monday
  dt.setUTCDate(dt.getUTCDate() + offset);
  return dt;
}

export function weekKeyOf(d: Date): string {
  return startOfISOWeek(d).toISOString().slice(0, 10);
}

export function buildWeekBuckets(endExclusive: Date, weeksBack: number): WeekBucket[] {
  const end = startOfISOWeek(endExclusive);
  const buckets: WeekBucket[] = [];
  for (let i = weeksBack - 1; i >= 0; i--) {
    const d = new Date(end.getTime() - i * 7 * MS_PER_DAY);
    buckets.push({
      weekStart: d.toISOString().slice(0, 10),
      weekLabel: formatWeekLabel(d, end),
    });
  }
  return buckets;
}

/**
 * Build week buckets covering [from, to). Useful for arbitrary historical
 * ranges (e.g. "Q2 2024") where `weeksBack` from today is meaningless. The
 * label includes the year whenever the range crosses a year boundary so the
 * x-axis stays readable for multi-year ranges.
 */
export function buildWeekBucketsBetween(from: Date, to: Date): WeekBucket[] {
  const start = startOfISOWeek(from);
  const buckets: WeekBucket[] = [];
  const crossesYears = from.getUTCFullYear() !== new Date(to.getTime() - 1).getUTCFullYear();
  let cursor = start;
  while (cursor.getTime() < to.getTime()) {
    buckets.push({
      weekStart: cursor.toISOString().slice(0, 10),
      weekLabel: cursor.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: crossesYears ? "2-digit" : undefined,
        timeZone: "UTC",
      }),
    });
    cursor = new Date(cursor.getTime() + 7 * MS_PER_DAY);
  }
  return buckets;
}

function formatWeekLabel(weekStart: Date, end: Date): string {
  // When the rolling range crosses a year boundary, prefix the year in compact form.
  const sameYear = weekStart.getUTCFullYear() === end.getUTCFullYear();
  return weekStart.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "2-digit",
    timeZone: "UTC",
  });
}

export function emptyCounts(weeks: number): number[] {
  return new Array<number>(weeks).fill(0);
}

export function indexByWeek(buckets: WeekBucket[]): Map<string, number> {
  const m = new Map<string, number>();
  buckets.forEach((b, i) => m.set(b.weekStart, i));
  return m;
}

/**
 * Increment counter[weekIdx] if the date falls inside the bucketed range.
 * Returns true on increment so the caller can also touch ancillary maps.
 */
export function bumpForDate(
  counter: number[],
  weekIndex: Map<string, number>,
  date: Date,
  weight = 1,
): number | null {
  const key = weekKeyOf(date);
  const idx = weekIndex.get(key);
  if (idx === undefined) return null;
  counter[idx]! += weight;
  return idx;
}

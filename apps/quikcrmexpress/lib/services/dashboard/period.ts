/**
 * Period / TZ helpers for the dashboard.
 *
 * We deliberately avoid adding `date-fns-tz` as a new dependency (the app-level
 * CLAUDE.md requires architect approval for new deps). All TZ math goes through
 * `Intl.DateTimeFormat` — that gives us correct DST handling for any IANA zone
 * without an extra package.
 *
 * The boundaries this file produces are the SAME ones the legacy reference
 * code computed naively in server-local time, but parameterized by the user's
 * TZ so an IST user and a PST user see correctly aligned day buckets.
 */

const MAX_RANGE_DAYS = 366;
const MS_PER_DAY = 86_400_000;

export type DateRange = {
  from: Date;
  to: Date;
  tz: string;
};

const FALLBACK_TZ = "UTC";

export function isValidIanaTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function safeTz(input: string | null | undefined): string {
  if (input && isValidIanaTz(input)) return input;
  return FALLBACK_TZ;
}

/** Wallclock parts for `instant` as observed in `tz`. */
function partsInTz(instant: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(instant)) {
    if (p.type !== "literal") out[p.type] = p.value;
  }
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour ?? "0"),
    minute: Number(out.minute ?? "0"),
    second: Number(out.second ?? "0"),
  };
}

/** Offset (ms) so that `wallTimeAsUTC + offset === instant`. */
function tzOffsetMs(instant: Date, tz: string): number {
  const p = partsInTz(instant, tz);
  const wallAsUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wallAsUTC - instant.getTime();
}

/** Returns the UTC instant that corresponds to 00:00:00 in `tz` on the same
 * calendar day as `instant`. */
export function startOfDayInTz(instant: Date, tz: string): Date {
  const offset = tzOffsetMs(instant, tz);
  const wall = new Date(instant.getTime() + offset);
  // Build wallclock midnight as if it were UTC, then subtract the offset to
  // get the real UTC instant.
  const midnightUTC = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());
  // Re-resolve offset at the new instant — DST transitions can change it.
  const candidate = new Date(midnightUTC - offset);
  const refined = tzOffsetMs(candidate, tz);
  return new Date(midnightUTC - refined);
}

export function endOfDayInTz(instant: Date, tz: string): Date {
  const start = startOfDayInTz(instant, tz);
  return new Date(start.getTime() + MS_PER_DAY - 1);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * MS_PER_DAY);
}

/** YYYY-MM-DD as observed in `tz`. */
export function isoDateInTz(instant: Date, tz: string): string {
  const p = partsInTz(instant, tz);
  return `${p.year.toString().padStart(4, "0")}-${p.month.toString().padStart(2, "0")}-${p.day.toString().padStart(2, "0")}`;
}

/** "Mon 28 Apr" using en-IN — matches the legacy backend label. */
export function formatBucketLabel(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(instant);
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Interpret "YYYY-MM-DD" as midnight in `tz`. Returns the corresponding UTC
 * instant. Throws if the string isn't a valid ISO date. */
function isoDateAtMidnightInTz(s: string, tz: string): Date {
  if (!ISO_DATE_RE.test(s)) throw badRequest(`Invalid date format: ${s}`);
  // Treat the noon UTC of the same calendar day as a "definitely-in-the-day"
  // anchor for the TZ math, then snap back to the local midnight.
  const anchor = new Date(`${s}T12:00:00Z`);
  if (isNaN(anchor.getTime())) throw badRequest(`Invalid date: ${s}`);
  return startOfDayInTz(anchor, tz);
}

/** Validate and clamp a from/to query pair. Throws Error("range too large") if
 * the range is over 366 days, or "invalid range" if to < from. */
export function parseAndClampRange(
  fromQ: string | null,
  toQ: string | null,
  tz: string,
  now: Date = new Date(),
): DateRange {
  const safeNow = endOfDayInTz(now, tz);
  let to: Date;
  let from: Date;

  if (toQ) {
    const dayStart = isoDateAtMidnightInTz(toQ, tz);
    const parsed = new Date(dayStart.getTime() + MS_PER_DAY - 1);
    to = parsed.getTime() > safeNow.getTime() ? safeNow : parsed;
  } else {
    to = safeNow;
  }

  if (fromQ) {
    from = isoDateAtMidnightInTz(fromQ, tz);
  } else {
    from = startOfDayInTz(addDays(to, -6), tz);
  }

  if (from.getTime() > to.getTime()) throw badRequest("`from` must be <= `to`");

  const days = Math.ceil((to.getTime() - from.getTime()) / MS_PER_DAY);
  if (days > MAX_RANGE_DAYS) throw badRequest(`Range too large (max ${MAX_RANGE_DAYS} days)`);

  return { from, to, tz };
}

function badRequest(message: string): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = 400;
  return err;
}

/** Returns the inclusive prior-period range of equal length. */
export function priorRange(range: DateRange): DateRange {
  const lenMs = range.to.getTime() - range.from.getTime();
  const priorTo = new Date(range.from.getTime() - 1);
  const priorFrom = new Date(priorTo.getTime() - lenMs);
  return { from: priorFrom, to: priorTo, tz: range.tz };
}

/** Number of whole days inclusively in the range (rounded up). */
export function rangeDays(range: DateRange): number {
  return Math.max(1, Math.ceil((range.to.getTime() - range.from.getTime()) / MS_PER_DAY));
}

/** Build per-day buckets from `from` through `to` inclusive, snapped to the
 * tz-local day boundary. Returns at most ~ceil((to-from)/day) buckets. */
export function buildDayBuckets(range: DateRange): {
  start: Date;
  end: Date;
  iso: string;
  label: string;
}[] {
  const buckets: { start: Date; end: Date; iso: string; label: string }[] = [];
  let cursor = startOfDayInTz(range.from, range.tz);
  const lastStart = startOfDayInTz(range.to, range.tz);

  // Cap to a sane max so a misconfigured range can't blow up the response.
  let safety = 400;
  while (cursor.getTime() <= lastStart.getTime() && safety-- > 0) {
    const start = cursor;
    const end = endOfDayInTz(start, range.tz);
    buckets.push({
      start,
      end,
      iso: isoDateInTz(start, range.tz),
      label: formatBucketLabel(start, range.tz),
    });
    // Advance ~24h then re-snap (handles DST).
    cursor = startOfDayInTz(addDays(start, 1), range.tz);
  }
  return buckets;
}

/**
 * Tagged delta result.
 *
 *   - "pct"  → prior > 0; renders "+X%" / "-X%".
 *   - "new"  → prior === 0 && value > 0; renders "↑ new" — calling out
 *              that a percentage from a zero base is undefined rather
 *              than rendering a misleading "+100%".
 *   - "none" → prior === 0 && value === 0; renders "—".
 */
export type DeltaResult =
  | { kind: "pct"; value: number }
  | { kind: "new" }
  | { kind: "none" };

/**
 * Period-comparison delta. Replaces the old deltaPct(value, prior): number
 * which collapsed every zero-prior case to 100 — see Bug 6.
 */
export function computeDelta(value: number, prior: number): DeltaResult {
  if (prior === 0) {
    return value === 0 ? { kind: "none" } : { kind: "new" };
  }
  return {
    kind: "pct",
    value: Math.round(((value - prior) / prior) * 100),
  };
}

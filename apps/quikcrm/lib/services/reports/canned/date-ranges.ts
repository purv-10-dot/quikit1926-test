/**
 * Date-range helpers for the canned report catalog.
 *
 * All ranges are tz-aware (the request carries the user's IANA zone via
 * the `tz` cookie — see Phase 1's `readTzFromCookieHeader`). Boundaries
 * are computed as the start of the local day in the user's tz, then
 * converted back to UTC instants for Prisma.
 */
import type { DefaultDateRange } from "./types";

/**
 * Parse `from`/`to` from the query string. Returns null when either is
 * absent or invalid — caller falls back to `resolveDefaultDateRange`.
 */
export function parseQueryDateRange(
  searchParams: URLSearchParams,
): { from: Date; to: Date } | null {
  const fromRaw = searchParams.get("from");
  const toRaw = searchParams.get("to");
  if (!fromRaw || !toRaw) return null;
  const from = new Date(fromRaw);
  const to = new Date(toRaw);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  if (from > to) return null;
  return { from, to };
}

/**
 * Returns the start-of-day UTC instant for a given Date, computed in the
 * caller's IANA tz. The Date returned is always at 00:00:00 local time
 * for that zone, expressed as a UTC moment.
 */
export function startOfDayInTz(d: Date, tz: string): Date {
  // Round-trip the date through Intl to extract Y/M/D in the target tz,
  // then construct a local-equivalent UTC midnight by formatting an
  // ISO-like string and parsing back with the tz offset.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const y = get("year");
  const m = get("month");
  const day = get("day");
  // Compute the UTC equivalent of "Y-M-D 00:00:00" in `tz` by figuring
  // out the offset implied by the parts at that wall-clock moment.
  const wallMidnightUtc = Date.UTC(Number(y), Number(m) - 1, Number(day));
  // The target tz's offset at that moment:
  const probe = new Date(wallMidnightUtc);
  const probeParts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "shortOffset",
  }).formatToParts(probe);
  const tzName = probeParts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const offsetMin = parseShortOffsetMinutes(tzName);
  return new Date(wallMidnightUtc - offsetMin * 60_000);
}

function parseShortOffsetMinutes(short: string): number {
  // "GMT+5:30", "GMT-08", "UTC", "GMT". Returns minutes east of UTC.
  const match = short.match(/([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const hh = Number(match[2] ?? 0);
  const mm = Number(match[3] ?? 0);
  return sign * (hh * 60 + mm);
}

export function startOfMonthInTz(d: Date, tz: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "01";
  // Replace day with "01" then go through startOfDayInTz.
  const firstOfMonth = new Date(`${get("year")}-${get("month")}-01T00:00:00Z`);
  return startOfDayInTz(firstOfMonth, tz);
}

export function startOfQuarterInTz(d: Date, tz: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(d);
  const y = Number(parts.find((p) => p.type === "year")?.value ?? "1970");
  const m = Number(parts.find((p) => p.type === "month")?.value ?? "1");
  const quarterStartMonth = Math.floor((m - 1) / 3) * 3 + 1;
  const probe = new Date(
    `${y}-${String(quarterStartMonth).padStart(2, "0")}-01T00:00:00Z`,
  );
  return startOfDayInTz(probe, tz);
}

/**
 * Resolve the named default range to concrete from/to instants in the
 * user's tz. `to` is the instant *now* — the catalog does not include
 * future-looking reports.
 */
export function resolveDefaultDateRange(
  range: DefaultDateRange,
  tz: string,
  now: Date = new Date(),
): { from: Date; to: Date } {
  const today = startOfDayInTz(now, tz);
  switch (range) {
    case "today":
      return { from: today, to: now };
    case "7d":
      return { from: new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000), to: now };
    case "30d":
      return { from: new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000), to: now };
    case "thisMonth":
      return { from: startOfMonthInTz(now, tz), to: now };
    case "thisQuarter":
      return { from: startOfQuarterInTz(now, tz), to: now };
  }
}

/**
 * Returns N days ago at start-of-day in the user's tz. Used by the
 * "stale leads" / "stuck deals" reports for their threshold cutoff.
 */
export function daysAgoStartOfDay(days: number, tz: string, now: Date = new Date()): Date {
  const today = startOfDayInTz(now, tz);
  return new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
}

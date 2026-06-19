/**
 * Timezone utilities for QuikSocial scheduling.
 *
 * RULE: scheduledFor is ALWAYS stored as UTC in the database.
 *       Conversion happens at the API boundary — incoming local time → UTC,
 *       outgoing UTC → local display. The cron job never touches timezones;
 *       it compares UTC dates against UTC now(), which is always correct.
 *
 * Requires: date-fns-tz (npm install date-fns-tz)
 */

import { fromZonedTime, toZonedTime, format } from "date-fns-tz";

/**
 * Converts a local datetime string from the user's timezone to a UTC Date.
 *
 * Use this at the API layer when the frontend sends a scheduledFor value.
 * The frontend should send ISO-like strings in local time (e.g. "2026-04-20T11:00"),
 * NOT UTC — the user picked a time in their own clock, and we convert it here.
 *
 * @param localDatetime - Local datetime string, e.g. "2026-04-20T11:00:00"
 * @param timezone      - IANA timezone, e.g. "Asia/Kolkata"
 * @returns             UTC Date object, ready to store in MongoDB
 *
 * @example
 *   // User in India picks 11:00 AM
 *   toUTC("2026-04-20T11:00:00", "Asia/Kolkata")
 *   // → 2026-04-20T05:30:00.000Z  (UTC)
 */
export function toUTC(localDatetime: string, timezone: string): Date {
  // fromZonedTime interprets the given datetime AS IF it is in `timezone`,
  // then returns the equivalent UTC Date.
  return fromZonedTime(localDatetime, timezone);
}

/**
 * Authoritative server-side conversion for an incoming scheduled time.
 * The single boundary every scheduledFor / requestedPublishTime write
 * goes through (POST /api/posts, PATCH /status, PATCH /submit-review,
 * and — later — campaign auto-schedule).
 *
 * Wire contract: the client sends a TZ-NAIVE local wall-clock string
 * ("YYYY-MM-DDTHH:mm" — no Z, no offset) = the time the user picked on
 * their own clock. We interpret it in `timezone` and return UTC.
 *
 * `timezone` is passed explicitly so interactive scheduling can pass the
 * user's profile tz (getUserTimezone(session)) while campaign
 * auto-schedule can pass `campaign.timezone` — one path, two callers.
 *
 * Transition safety: if the value already carries a `Z` or a ±hh:mm
 * offset (a caller not yet migrated, or a non-modal absolute timestamp),
 * we trust it as an absolute instant (`new Date`) rather than
 * re-interpreting it — so a stray ISO can never be double-shifted.
 *
 * Returns null for empty input, and null for an unparseable value (the
 * caller decides whether that's a 422).
 */
export function resolveScheduledForUtc(
  raw: string | null | undefined,
  timezone: string,
): Date | null {
  if (raw == null) return null;
  const value = String(raw).trim();
  if (!value) return null;

  // Already absolute (has Z or a ±hh:mm offset after the time)?
  const hasOffset = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(value);
  const parsed = hasOffset
    ? new Date(value)
    : toUTC(value, timezone || "UTC");

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Converts a UTC Date from the database back to a display string in the
 * user's local timezone.
 *
 * @param utcDate  - UTC Date from MongoDB
 * @param timezone - IANA timezone, e.g. "Asia/Kolkata"
 * @returns        Formatted local datetime string for display, e.g. "Apr 20, 2026 11:00 AM"
 *
 * @example
 *   toLocalDisplay(new Date("2026-04-20T05:30:00Z"), "Asia/Kolkata")
 *   // → "Apr 20, 2026 11:00 AM"
 */
export function toLocalDisplay(utcDate: Date, timezone: string): string {
  // toZonedTime shifts the UTC date into the target timezone's wall-clock time.
  const zonedDate = toZonedTime(utcDate, timezone);
  // format uses the shifted date and the timezone for DST-aware formatting.
  return format(zonedDate, "MMM d, yyyy h:mm aa", { timeZone: timezone });
}

/**
 * Returns the user's configured timezone from their session, falling back
 * to UTC if not set. Always returns a valid IANA string.
 *
 * @param session - NextAuth session object (or null/undefined)
 * @returns IANA timezone string
 */
export function getUserTimezone(session: any): string {
  return session?.user?.timezone || "UTC";
}

// NOTE: the canonical timezone option list lives in
// `@/lib/constants/timezones` (`SUPPORTED_TIMEZONES: TzOption[]`). The
// old region→IANA Record that used to live here was unused and a second
// source of truth — removed so settings + onboarding can't drift. Import
// the option list from the constants module for any dropdown.

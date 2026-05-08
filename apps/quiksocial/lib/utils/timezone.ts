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

/**
 * Supported timezones for the 8 calendar regions defined in CLAUDE.md.
 *
 * Key   = human-readable region label (used in dropdowns)
 * Value = IANA timezone identifier (stored on User, passed to toUTC/toLocalDisplay)
 *
 * For regions with multiple zones (USA, Russia), the primary/most-common
 * zone is the default. Users in those regions should be able to select
 * from the full IANA list in their profile settings.
 */
export const SUPPORTED_TIMEZONES: Record<string, string> = {
  // Asia
  India: "Asia/Kolkata",
  Pakistan: "Asia/Karachi",
  "Sri Lanka": "Asia/Colombo",
  Bangladesh: "Asia/Dhaka",
  UAE: "Asia/Dubai",

  // Americas
  "USA (Eastern)": "America/New_York",
  "USA (Central)": "America/Chicago",
  "USA (Mountain)": "America/Denver",
  "USA (Pacific)": "America/Los_Angeles",

  // Europe
  "Russia (Moscow)": "Europe/Moscow",
  "Russia (Yekaterinburg)": "Asia/Yekaterinburg",
  France: "Europe/Paris",

  // Fallback
  UTC: "UTC",
};

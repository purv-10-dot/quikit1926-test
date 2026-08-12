/**
 * Pure matching helpers for inbound meeting transcripts (Fathom.ai → QuikScale).
 *
 * The DB-touching orchestration lives in the save-transcript internal route;
 * everything here is pure so it can be unit-tested without a database:
 *   - parse the `HH:mm` planned windows stored on Client
 *   - convert a UTC ISO timestamp to a minute-of-day in the org's meeting tz
 *   - classify a meeting as DAILY vs WEEKLY by which planned window it falls in
 *
 * There is no canonical per-org timezone column in the shared schema, so the tz
 * is configurable via MEETING_TZ (default Asia/Kolkata — the current userbase).
 */

export const MEETING_TZ = process.env.MEETING_TZ ?? "Asia/Kolkata";

/** Default +/- minutes of slack around a planned window when classifying. */
export const DEFAULT_WINDOW_TOLERANCE_MIN = 30;

export type MeetingType = "DAILY" | "WEEKLY";

/** Parse "HH:mm" (24h) to minutes-of-day, or null when blank/invalid. */
export function parseHHMM(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Minute-of-day (0..1439) of an ISO instant, as read in `tz`. Uses Intl so no
 * tz database dependency is needed. Returns null on an unparseable input.
 */
export function minuteOfDayInTz(iso: string | null | undefined, tz: string = MEETING_TZ): number | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(date);
    const hour = Number(parts.find((p) => p.type === "hour")?.value);
    const minute = Number(parts.find((p) => p.type === "minute")?.value);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    // Intl can emit "24" for midnight in some runtimes — normalize to 0.
    return ((hour % 24) * 60 + minute) % 1440;
  } catch {
    return null;
  }
}

/** The calendar date (yyyy-mm-dd) of an ISO instant in `tz`. */
export function dateInTz(iso: string | null | undefined, tz: string = MEETING_TZ): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    if (!y || !m || !d) return null;
    return `${y}-${m}-${d}`;
  } catch {
    return null;
  }
}

/** True when `minute` is within [start-tol, end+tol], handling windows only. */
export function withinWindow(
  minute: number,
  start: number | null,
  end: number | null,
  tolerance = DEFAULT_WINDOW_TOLERANCE_MIN,
): boolean {
  if (start == null && end == null) return false;
  const lo = (start ?? end)! - tolerance;
  const hi = (end ?? start)! + tolerance;
  return minute >= lo && minute <= hi;
}

/** The planned-time subset of a Client used for classification. */
export interface ClientWindows {
  dailyStartTime: string | null;
  dailyEndTime: string | null;
  weeklyStartTime: string | null;
  weeklyEndTime: string | null;
}

/**
 * Classify a meeting as DAILY or WEEKLY from its start minute-of-day against a
 * client's planned windows. Falls back to duration (short = daily) when the
 * time is ambiguous or windows are missing. Returns null when nothing decides.
 */
export function classifyMeeting(
  startMinute: number | null,
  client: ClientWindows,
  durationMinutes: number | null,
  tolerance = DEFAULT_WINDOW_TOLERANCE_MIN,
): MeetingType | null {
  const dStart = parseHHMM(client.dailyStartTime);
  const dEnd = parseHHMM(client.dailyEndTime);
  const wStart = parseHHMM(client.weeklyStartTime);
  const wEnd = parseHHMM(client.weeklyEndTime);

  if (startMinute != null) {
    const inDaily = withinWindow(startMinute, dStart, dEnd, tolerance);
    const inWeekly = withinWindow(startMinute, wStart, wEnd, tolerance);
    if (inDaily && !inWeekly) return "DAILY";
    if (inWeekly && !inDaily) return "WEEKLY";
    // Both (overlapping windows) → duration breaks the tie below.
  }

  if (durationMinutes != null) {
    // Daily huddles are short; weekly L10s run long.
    if (durationMinutes <= 20) return "DAILY";
    if (durationMinutes >= 45) return "WEEKLY";
  }
  return null;
}

/** Normalize an email for case-insensitive comparison. */
export function normEmail(email: string | null | undefined): string | null {
  const e = email?.trim().toLowerCase();
  return e && e.includes("@") ? e : null;
}

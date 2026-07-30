import { differenceInCalendarDays, format, isToday, isYesterday } from "date-fns";

/** Channel-list timestamp: today → time, yesterday → "Yesterday", else "MMM d". */
export function formatChannelTime(value?: string | Date | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  if (isToday(d)) return format(d, "p");
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMM d");
}

/** Message timestamp shown next to the author (e.g. "3:42 PM"). */
export function formatMessageTime(value: string | Date): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return format(d, "p");
}

/** Date-divider label: Today / Yesterday / weekday (<7d) / "8 May 2026". */
export function dateDividerLabel(value: string | Date): string {
  const date = new Date(value);
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  const daysAgo = differenceInCalendarDays(new Date(), date);
  if (daysAgo > 0 && daysAgo < 7) return format(date, "EEEE");
  return format(date, "d MMM yyyy");
}

/** Full date heading, e.g. "Friday, 8 May 2026" (call-details pane). */
export function formatFullDate(value: string | Date): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return format(d, "EEEE, d MMMM yyyy");
}

/**
 * Call talk time as "m:ss" (e.g. 252 → "4:12"). Returns undefined for
 * null/0 — an unanswered call has no duration to show. Single home for the
 * rule; `postCallSummary` formats the same way for its summary message.
 */
export function formatCallDuration(seconds: number | null | undefined): string | undefined {
  if (!seconds || seconds <= 0) return undefined;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Voice-note length as "m:ss" (e.g. 5 → "0:05", 75 → "1:15"). Unlike
 * `formatCallDuration` this always returns a string — it drives a LIVE timer that
 * legitimately starts at "0:00", so an undefined-at-zero rule can't apply. Shared
 * by the recording bar, the staged chip, and the received-note label.
 */
export function formatVoiceDuration(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.floor(seconds ?? 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/** True if both timestamps fall on the same local calendar day. */
export function sameCalendarDay(
  a: string | Date | null | undefined,
  b: string | Date | null | undefined,
): boolean {
  if (!a || !b) return false;
  const dA = new Date(a);
  const dB = new Date(b);
  return (
    dA.getFullYear() === dB.getFullYear() &&
    dA.getMonth() === dB.getMonth() &&
    dA.getDate() === dB.getDate()
  );
}

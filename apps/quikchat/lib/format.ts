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

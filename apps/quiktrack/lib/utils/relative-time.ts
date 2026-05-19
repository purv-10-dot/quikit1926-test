/**
 * Small "n minutes/hours/days ago" formatter for table cells like Last Sign In.
 * No external dep — three breakpoints (minutes, hours, days) cover the
 * 0–30-day window; anything older falls back to a locale date string.
 *
 * Returns "Never" when the input is null/undefined.
 */
export function relativeTimeShort(input: string | Date | null | undefined): string {
  if (!input) return "Never";
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "Never";

  const diffMs = Date.now() - d.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return "just now";

  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;

  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;

  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;

  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const IST_TIME_ZONE = "Asia/Kolkata";

/**
 * Format a date-only value as `dd-mm-yyyy` (the app-wide display format).
 * Fast-paths `yyyy-mm-dd` strings so we never shift the day across a
 * timezone boundary; falls back to `Date` parsing for ISO timestamps.
 */
export function formatDate(
  value: string | number | Date | null | undefined,
): string {
  if (!value && value !== 0) return "—";
  const s = String(value).trim();
  if (!s) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return s;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

/**
 * Format a timestamp for display in the audit trail (Created / Last Updated).
 *
 * Renders in IST regardless of the server/browser timezone — audit cards were
 * previously showing UTC because a bare `toLocaleString()` picks up the render
 * environment's timezone (UTC on the server).
 */
export function formatDateTimeIST(
  value: string | number | Date | null | undefined,
): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return typeof value === "string" ? value : "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: IST_TIME_ZONE,
  });
}

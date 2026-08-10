/** Fixed locale + UTC so Node SSR and the browser hydrate identical date strings. */
const DISPLAY_LOCALE = "en-US";
const DISPLAY_TZ = "UTC";

const DATE_OPTS: Intl.DateTimeFormatOptions = {
  timeZone: DISPLAY_TZ,
  year: "numeric",
  month: "short",
  day: "numeric",
};

const DATETIME_OPTS: Intl.DateTimeFormatOptions = {
  timeZone: DISPLAY_TZ,
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

export function formatDate(d: Date | string | null | undefined, fallback = "—"): string {
  if (!d) return fallback;
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString(DISPLAY_LOCALE, DATE_OPTS);
}

export function formatDateTime(d: Date | string | null | undefined, fallback = "—"): string {
  if (!d) return fallback;
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString(DISPLAY_LOCALE, DATETIME_OPTS);
}

/** @deprecated Use formatDateTime — kept for call sites not yet migrated. */
export const formatDateTimeStable = formatDateTime;

export function startOfMonth(d: Date = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

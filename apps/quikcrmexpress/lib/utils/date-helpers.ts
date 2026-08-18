/**
 * Fixed locale + timezone so Node SSR and the browser hydrate identical date
 * strings (a fixed zone on both sides avoids React hydration mismatches).
 *
 * CrmExpress-specific: pinned to IST because this is a single-client Indian
 * deployment where every user is in Asia/Kolkata. Was "UTC", which was
 * hydration-safe but rendered wall-clock UTC (e.g. 10:33 instead of 16:03 IST).
 * TODO(quikcrm): QuikCRM is multi-customer across timezones — replace this
 * hardcoded zone with a per-user/tenant timezone resolved client-side after
 * mount (render neutral on the server, re-render in the user's zone on the
 * client) so hydration stays safe without pinning one zone for everyone.
 */
const DISPLAY_LOCALE = "en-US";
const DISPLAY_TZ = "Asia/Kolkata";

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

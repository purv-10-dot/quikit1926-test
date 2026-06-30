import { format, parseISO } from "date-fns";

export function formatDate(value: string | Date, pattern = "MMM d, yyyy") {
  const date = typeof value === "string" ? parseISO(value) : value;
  return format(date, pattern);
}

/** Convert a human/Zoho-style date pattern (e.g. "DD/MM/YYYY") to date-fns tokens. */
function toDateFnsPattern(pattern: string): string {
  return pattern
    .replace(/YYYY/g, "yyyy")
    .replace(/YY/g, "yy")
    .replace(/DD/g, "dd")
    .replace(/D/g, "d"); // MMM / MM / M are already valid date-fns month tokens
}

/**
 * Format a date using an organization/customer date_format string
 * (e.g. "MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD", "DD-MMM-YYYY"). Falls back to
 * DD/MM/YYYY, and returns the raw value if it isn't a parseable date.
 */
export function formatDateForPattern(value: string | Date | null | undefined, dateFormat?: string | null): string {
  if (!value) return "";
  let date: Date;
  try {
    date = typeof value === "string" ? parseISO(value.slice(0, 10)) : value;
  } catch {
    return String(value);
  }
  if (Number.isNaN(date.getTime())) return String(value);
  try {
    return format(date, toDateFnsPattern(dateFormat || "DD/MM/YYYY"));
  } catch {
    return format(date, "dd/MM/yyyy");
  }
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysISO(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

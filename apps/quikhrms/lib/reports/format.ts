// Shared formatting + query helpers used across report definitions.

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** ISO yyyy-mm-dd, safe for null/invalid. */
export function fmtDate(d?: Date | string | null): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  return isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

/** Numeric value rounded to 2dp (Prisma Decimals arrive as strings). */
export function num(v: unknown): number {
  const n = Number(v ?? 0);
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

/** Indian-grouped integer string, e.g. 1,23,456. */
export function inr(v: unknown): string {
  return INR.format(num(v));
}

export function fullName(e?: { firstName?: string | null; lastName?: string | null } | null): string {
  return e ? `${e.firstName ?? ""} ${e.lastName ?? ""}`.trim() : "";
}

/** Build a Prisma date-range filter for a field; empty object when no bounds. */
export function dateRange(field: string, from?: Date, to?: Date): Record<string, unknown> {
  if (!from && !to) return {};
  return { [field]: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } };
}

/** Indian fiscal year (Apr–Mar) label for a date, e.g. "2025-26". */
export function fiscalYear(d: Date): string {
  const y = d.getFullYear();
  const startYear = d.getMonth() >= 3 ? y : y - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

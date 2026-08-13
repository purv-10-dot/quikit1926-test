/**
 * Currency formatting helpers for the opportunities module.
 *
 * INR is special: Indian numbering system uses lakh (1e5) and crore (1e7), so
 * `Intl.NumberFormat("en-IN", { notation: "compact" })` produces "₹2.1Cr" only
 * on Node 18+ with full ICU. We hand-roll INR formatting to guarantee the
 * output regardless of the runtime's ICU profile.
 *
 * All other currencies use `Intl.NumberFormat` compact notation.
 */

const CRORE = 10_000_000; // 1e7
const LAKH = 100_000; // 1e5

export function formatINR(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return "₹0";
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";

  if (abs >= CRORE) {
    return `${sign}₹${stripTrailingZero((abs / CRORE).toFixed(1))}Cr`;
  }
  if (abs >= LAKH) {
    return `${sign}₹${stripTrailingZero((abs / LAKH).toFixed(1))}L`;
  }
  // Below 1L → render with Indian grouping (1,00,000) using en-IN locale.
  return `${sign}₹${new Intl.NumberFormat("en-IN").format(Math.round(abs))}`;
}

export function formatCompact(amount: number | null | undefined, currency: string): string {
  if (amount == null || Number.isNaN(amount)) return symbol(currency) + "0";
  const formatter = new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  });
  return `${symbol(currency)}${formatter.format(amount)}`;
}

export function formatGeneric(amount: number | null | undefined, currency: string): string {
  if (currency === "INR") return formatINR(amount);
  return formatCompact(amount, currency);
}

function symbol(currency: string): string {
  switch (currency.toUpperCase()) {
    case "INR":
      return "₹";
    case "USD":
      return "$";
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    case "JPY":
      return "¥";
    default:
      return `${currency.toUpperCase()} `;
  }
}

function stripTrailingZero(s: string): string {
  return s.replace(/\.0$/, "");
}

/** Coerce Prisma Decimal | string | number | null to a JS number. */
export function toNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  // Prisma Decimal exposes a toString() that round-trips precisely; toNumber()
  // also exists but we prefer the string form to avoid the Decimal import.
  if (typeof value === "object" && value !== null && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return Number(value);
}

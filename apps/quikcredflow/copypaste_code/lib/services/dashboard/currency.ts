/**
 * Currency formatting for the pipeline KPI.
 *
 * INR uses the lakh/crore convention (`₹4.2Cr`, `₹83.5L`); other currencies
 * use compact notation via Intl (`$1.2M`, `€430K`).
 */

const CURRENCY_GLYPH: Record<string, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
  AED: "د.إ",
  SGD: "S$",
  AUD: "A$",
  CAD: "C$",
  JPY: "¥",
};

export function currencyGlyph(currency: string): string {
  return CURRENCY_GLYPH[currency] ?? currency;
}

export function formatINR(amount: number): string {
  if (!Number.isFinite(amount) || amount === 0) return "₹0";
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (abs >= 1_00_00_000) {
    return `${sign}₹${(abs / 1_00_00_000).toFixed(abs >= 1_00_00_00_000 ? 0 : 2).replace(/\.?0+$/, "")}Cr`;
  }
  if (abs >= 1_00_000) {
    return `${sign}₹${(abs / 1_00_000).toFixed(2).replace(/\.?0+$/, "")}L`;
  }
  if (abs >= 1_000) {
    return `${sign}₹${(abs / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  }
  return `${sign}₹${Math.round(abs).toLocaleString("en-IN")}`;
}

/** Long-form INR for the legacy `pipelineValueDisplay` field. */
export function formatINRLong(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

export function formatCompactCurrency(amount: number, currency: string): string {
  if (currency === "INR") return formatINR(amount);
  if (!Number.isFinite(amount)) return `${currencyGlyph(currency)}0`;
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  const glyph = currencyGlyph(currency);
  if (abs >= 1_000_000_000) return `${sign}${glyph}${(abs / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (abs >= 1_000_000) return `${sign}${glyph}${(abs / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `${sign}${glyph}${(abs / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${sign}${glyph}${Math.round(abs)}`;
}

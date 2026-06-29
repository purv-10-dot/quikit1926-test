export const CURRENCIES = [
  { code: "USD", symbol: "$",   name: "US Dollar" },
  { code: "EUR", symbol: "€",   name: "Euro" },
  { code: "GBP", symbol: "£",   name: "British Pound" },
  { code: "INR", symbol: "₹",   name: "Indian Rupee" },
  { code: "JPY", symbol: "¥",   name: "Japanese Yen" },
  { code: "AUD", symbol: "A$",  name: "Australian Dollar" },
  { code: "CAD", symbol: "C$",  name: "Canadian Dollar" },
  { code: "SGD", symbol: "S$",  name: "Singapore Dollar" },
  { code: "AED", symbol: "AED", name: "UAE Dirham" },
  { code: "CHF", symbol: "CHF", name: "Swiss Franc" },
];

export const SCALES_WESTERN = [
  { label: "",          multiplier: 1 },
  { label: "Thousand",  multiplier: 1e3 },
  { label: "Million",   multiplier: 1e6 },
  { label: "Billion",   multiplier: 1e9 },
  { label: "Trillion",  multiplier: 1e12 },
];

export const SCALES_INR = [
  { label: "",          multiplier: 1 },
  { label: "Thousand",  multiplier: 1e3 },
  { label: "Lakh",      multiplier: 1e5 },
  { label: "Crore",     multiplier: 1e7 },
  { label: "Hundred Crore", multiplier: 1e9 },
];

export function getScales(currency: string) {
  return currency === "INR" ? SCALES_INR : SCALES_WESTERN;
}

export function getMultiplier(currency: string, scale: string): number {
  return getScales(currency).find(s => s.label === scale)?.multiplier ?? 1;
}

export function formatActual(value: number, symbol: string, currency: string): string {
  const locale = currency === "INR" ? "en-IN" : "en-US";
  return `${symbol}${value.toLocaleString(locale)}`;
}

/**
 * Display + input scaling for currency-denominated weekly cells (target
 * breakdown + actuals). KPIs store RAW values (e.g. ₹5 Cr → 50,000,000); when a
 * scale unit is chosen we want the per-week cells shown/typed in THAT unit
 * (2.5 Cr) rather than the raw expanded number.
 *
 * These are a pure DISPLAY/INPUT layer — stored values stay raw, so progress %,
 * colour logic and all calculations are unaffected. When the scale multiplier is
 * 1 (no scale, or non-currency units) they pass the value through unchanged.
 */

/** Raw stored number/string → string shown in the scale unit (e.g. 25000000 → "2.5"). */
export function scaleDownForDisplay(
  raw: number | string,
  currency: string,
  scale: string,
  maxDecimals = 2,
): string {
  const n = typeof raw === "string" ? parseFloat(raw) : raw;
  if (!Number.isFinite(n)) return "";
  const m = getMultiplier(currency, scale);
  if (m <= 1) return typeof raw === "string" ? raw : String(raw); // passthrough
  // Round to `maxDecimals`, dropping trailing zeros (2.50 → "2.5", 5 → "5").
  return String(Number((n / m).toFixed(maxDecimals)));
}

/** Compact unit label for a scale, shown next to weekly cells / list values.
 *  "" (no scale) and unknown scales return "" so callers can omit the suffix. */
const SHORT_SCALE_LABELS: Record<string, string> = {
  Thousand: "K",
  Lakh: "L",
  Million: "M",
  Crore: "Cr",
  Billion: "B",
  Trillion: "T",
  "Hundred Crore": "100 Cr",
};
export function shortScaleLabel(scale: string): string {
  return SHORT_SCALE_LABELS[scale] ?? "";
}

/** A value typed in the scale unit → raw stored string (e.g. "2.5" → "25000000"). */
export function scaleUpFromInput(display: string, currency: string, scale: string): string {
  const trimmed = (display ?? "").trim();
  if (trimmed === "") return ""; // preserve "cleared" so the cell can be emptied
  const n = parseFloat(trimmed);
  if (!Number.isFinite(n)) return "";
  return String(n * getMultiplier(currency, scale));
}

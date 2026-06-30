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

/** Compact unit labels for a chosen target scale (e.g. "Crore" → "Cr"). */
const SHORT_SCALE_LABELS: Record<string, string> = {
  Thousand: "K",
  Lakh: "L",
  Million: "M",
  Crore: "Cr",
  Billion: "B",
  Trillion: "T",
  "Hundred Crore": "100 Cr",
};

/** Short unit suffix for a scale label; "" for no scale / unknown scale. */
export function shortScaleLabel(scale: string | null | undefined): string {
  return (scale && SHORT_SCALE_LABELS[scale]) || "";
}

/**
 * Display/input scaling for currency cells when a KPI's scaled-display toggle is
 * on. Stored values are RAW; these convert between the raw value and the
 * scale-unit value the user sees/types. Passthrough when the scale multiplier
 * is 1 (no scale / non-applicable).
 *
 *   scaleDownForDisplay(25000000, "INR", "Crore") → "2.5"   (raw → unit)
 *   scaleUpFromInput("2.5",       "INR", "Crore") → "25000000" (unit → raw)
 */
export function scaleDownForDisplay(
  raw: number | string,
  currency: string,
  scale: string,
  maxDecimals = 2,
): string {
  const n = typeof raw === "string" ? parseFloat(raw) : raw;
  if (!Number.isFinite(n)) return "";
  const m = getMultiplier(currency, scale);
  if (m <= 1) return typeof raw === "string" ? raw : String(raw);
  return String(Number((n / m).toFixed(maxDecimals)));
}

/**
 * The currency symbol to prefix scaled Target-Breakdown cells with (e.g. "₹").
 * Returns "" unless the KPI is a Currency KPI with a chosen scale AND the
 * scaled-display toggle is on — i.e. exactly when the cells render in the unit.
 */
export function breakdownCurrencyPrefix(opts: {
  scaledDisplay?: boolean;
  measurementUnit?: string | null;
  currency?: string | null;
  targetScale?: string | null;
}): string {
  const { scaledDisplay, measurementUnit, currency, targetScale } = opts;
  if (!scaledDisplay || measurementUnit !== "Currency" || !currency || !targetScale) return "";
  if (getMultiplier(currency, targetScale) <= 1) return "";
  return CURRENCIES.find(c => c.code === currency)?.symbol ?? "";
}

export function scaleUpFromInput(display: string, currency: string, scale: string): string {
  const t = (display ?? "").trim();
  if (t === "") return "";
  const n = parseFloat(t);
  if (!Number.isFinite(n)) return "";
  const m = getMultiplier(currency, scale);
  if (m <= 1) return display;
  return String(n * m);
}

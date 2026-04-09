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

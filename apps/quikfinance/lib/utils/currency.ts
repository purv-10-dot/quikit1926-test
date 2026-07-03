import { dinero, toDecimal } from "dinero.js";
import { AUD, CAD, EUR, GBP, INR, JPY, USD } from "@dinero.js/currencies";

const currencyMap = {
  AUD,
  CAD,
  EUR,
  GBP,
  INR,
  JPY,
  USD
} as const;

export type SupportedCurrency = keyof typeof currencyMap;

export function toMinorUnits(amount: number, precision = 2) {
  return Math.round(amount * 10 ** precision);
}

// Best-fit locale per currency so the symbol and digit grouping match the
// currency rather than always using India's grouping.
const localeByCurrency: Record<SupportedCurrency, string> = {
  INR: "en-IN",
  USD: "en-US",
  EUR: "en-IE",
  GBP: "en-GB",
  AUD: "en-AU",
  CAD: "en-CA",
  JPY: "ja-JP"
};

// The organisation's base currency (from Company settings). Set once at app
// load by CurrencyProvider so every formatMoney() call without an explicit
// currency renders in the configured currency. Defaults to INR until loaded.
let runtimeDefaultCurrency: SupportedCurrency = "INR";

export function setDefaultCurrency(currency: string) {
  if (currency in currencyMap) {
    runtimeDefaultCurrency = currency as SupportedCurrency;
  }
}

export function getDefaultCurrency(): SupportedCurrency {
  return runtimeDefaultCurrency;
}

export function formatMoney(amount: number, currency?: string, locale?: string) {
  const supportedCurrency = currency && currency in currencyMap ? (currency as SupportedCurrency) : runtimeDefaultCurrency;
  const resolvedLocale = locale ?? localeByCurrency[supportedCurrency] ?? "en-IN";
  const value = dinero({
    amount: toMinorUnits(amount, currencyMap[supportedCurrency].exponent),
    currency: currencyMap[supportedCurrency]
  });

  return new Intl.NumberFormat(resolvedLocale, {
    style: "currency",
    currency: supportedCurrency
  }).format(Number(toDecimal(value)));
}

/** Currency formatter with a custom max fraction digits (e.g. whole rupees on report grids). */
export function formatMoneyDigits(amount: number, maximumFractionDigits: number, currency?: string) {
  const supportedCurrency = currency && currency in currencyMap ? (currency as SupportedCurrency) : runtimeDefaultCurrency;
  const resolvedLocale = localeByCurrency[supportedCurrency] ?? "en-IN";
  return new Intl.NumberFormat(resolvedLocale, {
    style: "currency",
    currency: supportedCurrency,
    maximumFractionDigits
  }).format(amount);
}

/** Compact currency formatter for chart axes, e.g. "₹12k", "$1.2M". */
export function formatMoneyCompact(amount: number, currency?: string) {
  const supportedCurrency = currency && currency in currencyMap ? (currency as SupportedCurrency) : runtimeDefaultCurrency;
  const resolvedLocale = localeByCurrency[supportedCurrency] ?? "en-IN";
  return new Intl.NumberFormat(resolvedLocale, {
    style: "currency",
    currency: supportedCurrency,
    notation: "compact",
    maximumFractionDigits: 1
  }).format(amount);
}

export function calculateLineTotal(quantity: number, rate: number, discount = 0, taxRate = 0) {
  const subtotal = quantity * rate;
  const discounted = Math.max(subtotal - discount, 0);
  const tax = discounted * (taxRate / 100);
  return Number((discounted + tax).toFixed(2));
}

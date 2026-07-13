"use client";

import { createContext, useContext, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import { formatMoney, formatMoneyCompact, getDefaultCurrency, setDefaultCurrency } from "@/lib/utils/currency";

type CompanySummary = { name?: string; base_currency?: string; preferred_language?: "en" | "hi" };

type CurrencyContextValue = {
  /** The organisation's base currency (from Company settings). */
  currency: string;
  /** Format an amount in the org's base currency. */
  format: (amount: number) => string;
  /** Compact format for chart axes. */
  formatCompact: (amount: number) => string;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

const LOCALE_STORAGE_KEY = "qf-locale";

/**
 * Loads the org's base currency (and saved language) from Company settings and
 * makes the currency the app-wide default, so every formatMoney() call renders
 * in the configured currency. Shares the "company-summary" query with Topbar.
 */
export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const { setLocale } = useI18n();

  const { data } = useQuery({
    queryKey: ["company-summary"],
    queryFn: async () => {
      const response = await fetch("/api/v1/settings/company");
      if (!response.ok) return null;
      const payload = (await response.json()) as { data?: CompanySummary };
      return payload.data ?? null;
    },
    staleTime: 5 * 60_000
  });

  const currency = data?.base_currency ?? getDefaultCurrency();

  // Keep the module-level default in sync so non-context formatMoney() calls
  // across the app pick up the configured currency.
  useEffect(() => {
    if (data?.base_currency) setDefaultCurrency(data.base_currency);
  }, [data?.base_currency]);

  // Apply the org's saved language the first time (when the user hasn't already
  // chosen one on this device). Manual switches persist to localStorage.
  useEffect(() => {
    if (!data?.preferred_language) return;
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(LOCALE_STORAGE_KEY) : null;
    if (!stored) setLocale(data.preferred_language);
  }, [data?.preferred_language, setLocale]);

  const value = useMemo<CurrencyContextValue>(
    () => ({
      currency,
      format: (amount: number) => formatMoney(amount, currency),
      formatCompact: (amount: number) => formatMoneyCompact(amount, currency)
    }),
    [currency]
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) {
    // Safe fallback: use the module default if the provider is absent.
    return {
      currency: getDefaultCurrency(),
      format: (amount: number) => formatMoney(amount),
      formatCompact: (amount: number) => formatMoneyCompact(amount)
    } satisfies CurrencyContextValue;
  }
  return context;
}

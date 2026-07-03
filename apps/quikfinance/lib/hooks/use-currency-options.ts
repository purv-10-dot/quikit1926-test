"use client";

import { useQuery } from "@tanstack/react-query";

export type CurrencyOption = { value: string; label: string };

/**
 * Shared currency lookup for selectors (customer, quote, bank account, …).
 * One cached query keyed app-wide, so currencies are fetched once and reused.
 * Currencies change rarely, so a long staleTime avoids redundant refetches.
 */
export function useCurrencyOptions(): CurrencyOption[] {
  const { data = [] } = useQuery({
    queryKey: ["currency-options"],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<CurrencyOption[]> => {
      const r = await fetch("/api/v1/currencies?per_page=200");
      const list = r.ok ? (((await r.json()) as { data?: Array<Record<string, unknown>> }).data ?? []) : [];
      const opts = list.map((c) => ({ value: String(c.code), label: `${String(c.code)}${c.name ? ` — ${String(c.name)}` : ""}` }));
      return opts.length ? opts : [{ value: "INR", label: "INR — Indian Rupee" }];
    }
  });
  return data;
}

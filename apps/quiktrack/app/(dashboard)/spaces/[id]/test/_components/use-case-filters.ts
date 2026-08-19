"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { CASE_FILTER_KEYS, type CaseFilterKey } from "@/lib/test/caseFilters";

/**
 * Test-case filter state, mirrored to the URL (QUIKTR-341).
 *
 * Every key comes from `CASE_FILTER_KEYS` — the same list the API and the filter
 * panel are built from — so adding a filter to that one file is enough; nothing here
 * needs to change to carry it into the URL and the fetch query.
 *
 * State lives IN THE URL (via `useSearchParams`), not in `useState`: a filtered case
 * list should be bookmarkable and shareable exactly like the existing Issue List view
 * (`list-view.tsx`), which this hook otherwise mirrors.
 */

export type CaseFilterState = Partial<Record<CaseFilterKey, string>>;

function readFromQuery(sp: URLSearchParams): CaseFilterState {
  const out: CaseFilterState = {};
  for (const key of CASE_FILTER_KEYS) {
    const v = sp.get(key);
    if (v) out[key] = v;
  }
  return out;
}

export function useCaseFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo(
    () => readFromQuery(new URLSearchParams(searchParams?.toString() ?? "")),
    [searchParams],
  );

  const activeCount = Object.keys(filters).length;

  const writeParams = useCallback(
    (next: CaseFilterState) => {
      // Non-filter params (suite/section selection is component state, not URL —
      // unaffected here) are preserved by starting from the current search params
      // and only touching filter keys.
      const p = new URLSearchParams(searchParams?.toString() ?? "");
      for (const key of CASE_FILTER_KEYS) p.delete(key);
      for (const key of CASE_FILTER_KEYS) {
        const v = next[key];
        if (v) p.set(key, v);
      }
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  /** Replace one filter's value. Empty string / undefined clears it. */
  const setFilter = useCallback(
    (key: CaseFilterKey, value: string | undefined) => {
      writeParams({ ...filters, [key]: value || undefined });
    },
    [filters, writeParams],
  );

  const clearFilter = useCallback(
    (key: CaseFilterKey) => setFilter(key, undefined),
    [setFilter],
  );

  const clearAll = useCallback(() => writeParams({}), [writeParams]);

  /** Builds the `/api/test/cases` query string for the current filters. */
  const toQueryString = useCallback(
    (extra: Record<string, string>) => {
      const p = new URLSearchParams(extra);
      for (const key of CASE_FILTER_KEYS) {
        const v = filters[key];
        if (v) p.set(key, v);
      }
      return p.toString();
    },
    [filters],
  );

  return { filters, activeCount, setFilter, clearFilter, clearAll, toQueryString };
}

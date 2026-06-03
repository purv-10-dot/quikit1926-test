"use client";

/**
 * useFiscalYears — DB-scoped fiscal-year + configured-quarter list.
 *
 * Single source of truth for the shared <FiscalPeriodPicker> across every
 * module (KPI, Team KPI, Priority, Dashboard, OPSP, and their modals).
 *
 * Backed by `/api/org/fiscal-years`, which reads distinct fiscal years from
 * QuarterSetting rows for the current tenant. A module-level cache avoids
 * duplicate fetches when multiple pickers mount simultaneously.
 *
 * Live-invalidation: `invalidateFiscalYearsCache()` not only clears the
 * cache but ALSO pushes a refetch to every currently-mounted consumer via
 * a subscriber set. This is what lets `QuarterRequiredGuard` (which is
 * mounted at the dashboard layout level and never unmounts on route
 * changes) flip from "Quarters not set up yet" → real content the moment
 * the user generates quarters, without needing a hard reload.
 */
import { useEffect, useState } from "react";

export interface FiscalYearsData {
  years: number[];
  configured: Array<{ year: number; quarter: string }>;
}

let cache: FiscalYearsData | null = null;
let inflight: Promise<FiscalYearsData> | null = null;
const listeners = new Set<() => void>();

async function fetchFiscalYears(): Promise<FiscalYearsData> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = fetch("/api/org/fiscal-years")
    .then(r => r.json())
    .then(d => {
      const data: FiscalYearsData = d?.success && d?.data
        ? { years: d.data.years ?? [], configured: d.data.configured ?? [] }
        : { years: [], configured: [] };
      cache = data;
      return data;
    })
    .catch(() => ({ years: [], configured: [] }))
    .finally(() => { inflight = null; });
  return inflight;
}

export interface FiscalYearsResult extends FiscalYearsData {
  isLoading: boolean;
}

export function useFiscalYears(): FiscalYearsResult {
  const [data, setData] = useState<FiscalYearsData>(cache ?? { years: [], configured: [] });
  const [isLoading, setIsLoading] = useState(!cache);

  useEffect(() => {
    let alive = true;

    function load() {
      setIsLoading(true);
      fetchFiscalYears().then(d => {
        if (alive) {
          setData(d);
          setIsLoading(false);
        }
      });
    }

    load();
    listeners.add(load);
    return () => {
      alive = false;
      listeners.delete(load);
    };
  }, []);

  return { ...data, isLoading };
}

/**
 * Drop the shared cache AND push a refetch to every currently-mounted
 * `useFiscalYears` consumer. Call this after any org-setup CRUD that
 * changes the configured fiscal-year set (generate, delete-row,
 * delete-FY) so guards and pickers across the app reflect the new state
 * without requiring a page reload.
 */
export function invalidateFiscalYearsCache() {
  cache = null;
  inflight = null;
  listeners.forEach(fn => fn());
}

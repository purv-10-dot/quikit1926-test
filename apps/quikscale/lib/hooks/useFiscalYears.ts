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
 */
import { useEffect, useState } from "react";

export interface FiscalYearsData {
  years: number[];
  configured: Array<{ year: number; quarter: string }>;
}

let cache: FiscalYearsData | null = null;
let inflight: Promise<FiscalYearsData> | null = null;

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

export function useFiscalYears(): FiscalYearsData {
  const [data, setData] = useState<FiscalYearsData>(cache ?? { years: [], configured: [] });
  useEffect(() => {
    let alive = true;
    fetchFiscalYears().then(d => { if (alive) setData(d); });
    return () => { alive = false; };
  }, []);
  return data;
}

/** Test / admin helper — force a refetch on next mount (e.g., after org-setup CRUD). */
export function invalidateFiscalYearsCache() {
  cache = null;
  inflight = null;
}

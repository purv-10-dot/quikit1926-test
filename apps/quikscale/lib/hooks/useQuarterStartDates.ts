"use client";

/**
 * useQuarterStartDates — DB-scoped (year, quarter) → startDate map.
 *
 * Backed by `/api/org/quarter-settings`. Powers the Priority modal/table
 * so its week-date labels reflect the tenant's real week-aligned quarter
 * start (e.g. Dec 29, 2025 for Q4) rather than the calendar-month
 * boundaries hardcoded in `QUARTER_STARTS`.
 *
 * Module-level cache (same pattern as `useFiscalYears`) so multiple
 * consumers don't re-fetch.
 */
import { useEffect, useState } from "react";

export interface QuarterRow {
  fiscalYear: number;
  quarter: string;
  startDate: string;   // YYYY-MM-DD
  endDate: string;     // YYYY-MM-DD
  weekCount?: number;  // Custom Quarter Settings; default 13
}

export interface QuarterStartDatesData {
  quarters: QuarterRow[];
}

let cache: QuarterStartDatesData | null = null;
let inflight: Promise<QuarterStartDatesData> | null = null;
const listeners = new Set<() => void>();

async function fetchQuarterStartDates(): Promise<QuarterStartDatesData> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = fetch("/api/org/quarter-settings")
    .then((r) => r.json())
    .then((d): QuarterStartDatesData => {
      const data: QuarterStartDatesData =
        d?.success && d?.data ? { quarters: d.data.quarters ?? [] } : { quarters: [] };
      cache = data;
      return data;
    })
    .catch((): QuarterStartDatesData => ({ quarters: [] }))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export interface QuarterStartDatesResult extends QuarterStartDatesData {
  isLoading: boolean;
  /** Lookup helper — returns the startDate (YYYY-MM-DD) or null when not configured. */
  getStartDate: (year: number, quarter: string) => string | null;
  /** Lookup helper — returns the endDate (YYYY-MM-DD) or null when not configured.
   *  Needed to clamp the final meeting-day-aligned week to the quarter end. */
  getEndDate: (year: number, quarter: string) => string | null;
  /** Lookup helper — returns the quarter's week count, defaulting to 13. */
  getWeekCount: (year: number, quarter: string) => number;
}

export function useQuarterStartDates(): QuarterStartDatesResult {
  const [data, setData] = useState<QuarterStartDatesData>(cache ?? { quarters: [] });
  const [isLoading, setIsLoading] = useState(!cache);

  useEffect(() => {
    let alive = true;

    function load() {
      setIsLoading(true);
      fetchQuarterStartDates().then((d) => {
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

  function getStartDate(year: number, quarter: string): string | null {
    const hit = data.quarters.find((q) => q.fiscalYear === year && q.quarter === quarter);
    return hit ? hit.startDate : null;
  }

  function getEndDate(year: number, quarter: string): string | null {
    const hit = data.quarters.find((q) => q.fiscalYear === year && q.quarter === quarter);
    return hit ? hit.endDate : null;
  }

  function getWeekCount(year: number, quarter: string): number {
    const hit = data.quarters.find((q) => q.fiscalYear === year && q.quarter === quarter);
    return hit?.weekCount ?? 13;
  }

  return { ...data, isLoading, getStartDate, getEndDate, getWeekCount };
}

/**
 * Drop the cache and push a refetch to mounted consumers. Call after
 * org-setup CRUD that changes QuarterSetting rows.
 */
export function invalidateQuarterStartDatesCache() {
  cache = null;
  inflight = null;
  listeners.forEach((fn) => fn());
}

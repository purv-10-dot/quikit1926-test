"use client";

import { useEffect, useState } from "react";
import { getCurrentFiscalWeekFromStart } from "@/lib/utils/fiscal";

interface QuarterRow {
  fiscalYear: number;
  quarter: string;
  startDate: string;
  endDate: string;
}

// Module-level cache
let cache: QuarterRow[] | null = null;
let pending: Promise<void> | null = null;

async function ensureLoaded() {
  if (cache) return;
  if (!pending) {
    pending = (async () => {
      try {
        const res = await fetch("/api/org/quarters");
        const json = await res.json();
        if (json.success) cache = json.data as QuarterRow[];
        else cache = [];
      } catch {
        cache = [];
      }
    })();
  }
  await pending;
}

/**
 * Returns the current fiscal week for a given (year, quarter) based on the
 * actual QuarterSetting.startDate from the DB.
 *
 * Returns null while loading. Once loaded, returns a number 1-13.
 */
export function useCurrentWeek(year: number | null | undefined, quarter: string | null | undefined): number | null {
  const [week, setWeek] = useState<number | null>(null);

  useEffect(() => {
    if (!year || !quarter) {
      setWeek(null);
      return;
    }

    (async () => {
      await ensureLoaded();
      const match = cache?.find((q) => q.fiscalYear === year && q.quarter === quarter);
      if (match) {
        setWeek(getCurrentFiscalWeekFromStart(match.startDate));
      } else {
        // Fallback: assume it's week 1 if we don't have data
        setWeek(1);
      }
    })();
  }, [year, quarter]);

  return week;
}

/** Invalidate cache (call after quarter settings are changed). */
export function invalidateCurrentWeekCache() {
  cache = null;
  pending = null;
}

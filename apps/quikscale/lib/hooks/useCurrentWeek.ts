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

/**
 * Compact week label — matches utils/fiscal.weekDateLabel format
 * ("1–7 Apr" or cross-month "29 Apr–5 May"), but DB-driven.
 * Returns null while loading or if quarter is unknown.
 */
function formatCompactWeekLabel(weekStart: Date, weekEnd: Date): string {
  const shortMonth = (d: Date) => d.toLocaleDateString("en-GB", { month: "short" });
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  if (sameMonth) {
    return `${weekStart.getDate()}–${weekEnd.getDate()} ${shortMonth(weekEnd)}`;
  }
  return `${weekStart.getDate()} ${shortMonth(weekStart)}–${weekEnd.getDate()} ${shortMonth(weekEnd)}`;
}

/**
 * Returns an array of 13 compact week labels (one per week) for the given
 * (year, quarter) using the DB's QuarterSetting.startDate. Labels are indexed
 * [week-1], so `labels[2]` is Week 3's label.
 *
 * Returns an empty array while loading or if the quarter is unknown.
 * Use this to replace legacy `weekDateLabel(year, quarter, w)` in table
 * column headers so week dates honour the tenant's quarter offset.
 */
export function useWeekLabels(
  year: number | null | undefined,
  quarter: string | null | undefined,
): string[] {
  const [labels, setLabels] = useState<string[]>([]);

  useEffect(() => {
    if (!year || !quarter) {
      setLabels([]);
      return;
    }
    (async () => {
      await ensureLoaded();
      const match = cache?.find((q) => q.fiscalYear === year && q.quarter === quarter);
      if (!match) {
        setLabels([]);
        return;
      }
      const start = new Date(match.startDate);
      const out: string[] = [];
      for (let w = 1; w <= 13; w++) {
        const ws = new Date(start);
        ws.setDate(ws.getDate() + (w - 1) * 7);
        const we = new Date(ws);
        we.setDate(we.getDate() + 6);
        out.push(formatCompactWeekLabel(ws, we));
      }
      setLabels(out);
    })();
  }, [year, quarter]);

  return labels;
}

/**
 * Returns a human-readable date range for a given (year, quarter, week) using
 * the actual QuarterSetting.startDate from the DB. Matches the format used by
 * the legacy utils/fiscal.getWeekDateRange — "1 Apr – 7 Apr".
 *
 * Returns null while loading. Falls back to null if the quarter is unknown
 * (caller should hide the range label).
 */
export function useWeekDateRange(
  year: number | null | undefined,
  quarter: string | null | undefined,
  weekNumber: number | null | undefined,
): string | null {
  const [range, setRange] = useState<string | null>(null);

  useEffect(() => {
    if (!year || !quarter || !weekNumber || weekNumber < 1 || weekNumber > 13) {
      setRange(null);
      return;
    }

    (async () => {
      await ensureLoaded();
      const match = cache?.find((q) => q.fiscalYear === year && q.quarter === quarter);
      if (!match) {
        setRange(null);
        return;
      }
      const start = new Date(match.startDate);
      const weekStart = new Date(start);
      weekStart.setDate(weekStart.getDate() + (weekNumber - 1) * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      setRange(`${fmt(weekStart)} – ${fmt(weekEnd)}`);
    })();
  }, [year, quarter, weekNumber]);

  return range;
}

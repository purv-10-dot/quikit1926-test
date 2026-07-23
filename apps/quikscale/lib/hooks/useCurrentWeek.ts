"use client";

import { useEffect, useState } from "react";
import {
  getCurrentFiscalWeekFromStart,
  qtdReferenceWeek,
  resolveQuarterForDate,
  resolveQuarterPosition,
  generateMeetingDayWeeks,
  meetingDayIndex,
  DEFAULT_WEEKS_PER_QUARTER,
  MAX_WEEKS_PER_QUARTER,
  type QuarterPosition,
} from "@/lib/utils/fiscal";
import { useCustomQuarterSettings, useWeeklyMeetingDay } from "@/lib/hooks/useFeatureFlags";

/**
 * Effective weekly meeting day for week alignment — the configured day when
 * Custom Quarter Settings is ON, else `null`. A `null` result disables all
 * meeting-day generation below, so with the toggle off these hooks behave
 * exactly as they did before (legacy calendar weeks).
 */
function useEffectiveMeetingDay(): string | null {
  const customOn = useCustomQuarterSettings();
  const meetingDay = useWeeklyMeetingDay();
  return customOn ? meetingDay : null;
}

interface QuarterRow {
  fiscalYear: number;
  quarter: string;
  startDate: string;
  endDate: string;
  weekCount?: number;
}

/** Week count for a cached quarter row, defaulting to the legacy 13. */
function rowWeekCount(row: QuarterRow | undefined): number {
  return row?.weekCount ?? DEFAULT_WEEKS_PER_QUARTER;
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
  const meetingDay = useEffectiveMeetingDay();

  useEffect(() => {
    if (!year || !quarter) {
      setWeek(null);
      return;
    }

    (async () => {
      await ensureLoaded();
      const match = cache?.find((q) => q.fiscalYear === year && q.quarter === quarter);
      if (match) {
        setWeek(getCurrentFiscalWeekFromStart(match.startDate, rowWeekCount(match), meetingDay, match.endDate));
      } else {
        // Fallback: assume it's week 1 if we don't have data
        setWeek(1);
      }
    })();
  }, [year, quarter, meetingDay]);

  return week;
}

/**
 * Where a given (year, quarter) sits relative to today: "past" | "current" |
 * "future", resolved from the tenant's real quarter start/end dates. Returns
 * `null` while the quarter rows are still loading. Feed this to
 * `weekEditState` so per-week edit gating is quarter/year-aware (a past
 * quarter's last week and a future quarter's first week no longer slip through
 * the clamped `useCurrentWeek` value).
 */
export function useQuarterPosition(
  year: number | null | undefined,
  quarter: string | null | undefined,
): QuarterPosition | null {
  const [position, setPosition] = useState<QuarterPosition | null>(null);

  useEffect(() => {
    if (!year || !quarter) {
      setPosition(null);
      return;
    }
    (async () => {
      await ensureLoaded();
      const match = cache?.find((q) => q.fiscalYear === year && q.quarter === quarter);
      // No row for this quarter → treat as current so gating falls back to the
      // week-number window rather than locking everything.
      setPosition(match ? resolveQuarterPosition(match.startDate, match.endDate) : "current");
    })();
  }, [year, quarter]);

  return position;
}

/**
 * Returns the CURRENT quarter ("Q1".."Q4") for a fiscal year, resolved from the
 * tenant's actual QuarterSetting date ranges (Custom-Quarter aware) rather than
 * the calendar month. Returns null while loading or when today falls outside the
 * year's configured quarters — callers can then fall back to `getFiscalQuarter`.
 */
export function useCurrentQuarter(year: number | null | undefined): "Q1" | "Q2" | "Q3" | "Q4" | null {
  const [quarter, setQuarter] = useState<"Q1" | "Q2" | "Q3" | "Q4" | null>(null);

  useEffect(() => {
    if (!year) {
      setQuarter(null);
      return;
    }
    (async () => {
      await ensureLoaded();
      const rows = (cache ?? []).filter((q) => q.fiscalYear === year);
      setQuarter(resolveQuarterForDate(rows, new Date()));
    })();
  }, [year]);

  return quarter;
}

/**
 * Returns the QTD "reference week" for a (year, quarter) — the value to pass to
 * `computeQtd`/`resolveProgress*` so quarter-to-date counts the correct number
 * of completed weeks whether the quarter is past, current, or future (see
 * `fiscal.qtdReferenceWeek`). Use this INSTEAD of `useCurrentWeek` for QTD math:
 * a fully-past quarter returns `weekCount + 1` (all weeks complete) instead of
 * the clamped `weekCount`, so its final week is no longer dropped from QTD.
 *
 * Returns null while loading. Not for display/highlighting — use
 * `useCurrentWeek` for that.
 */
export function useQtdReferenceWeek(
  year: number | null | undefined,
  quarter: string | null | undefined,
): number | null {
  const [ref, setRef] = useState<number | null>(null);
  const meetingDay = useEffectiveMeetingDay();

  useEffect(() => {
    if (!year || !quarter) {
      setRef(null);
      return;
    }
    (async () => {
      await ensureLoaded();
      const match = cache?.find((q) => q.fiscalYear === year && q.quarter === quarter);
      if (!match) {
        // Unknown quarter — treat as not-yet-started so QTD stays 0 rather than
        // inventing a full-quarter total.
        setRef(1);
        return;
      }
      setRef(
        qtdReferenceWeek(match.startDate, match.endDate, rowWeekCount(match), new Date(), meetingDay),
      );
    })();
  }, [year, quarter, meetingDay]);

  return ref;
}

/** Invalidate cache (call after quarter settings are changed). */
export function invalidateCurrentWeekCache() {
  cache = null;
  pending = null;
}

/**
 * Returns the number of weeks in a given (year, quarter) from the DB's
 * QuarterSetting.weekCount. Defaults to 13 while loading or when the quarter is
 * unknown, so callers can use it as a divisor / loop bound unconditionally.
 *
 * This is the primary hook every week-aware surface (KPI, Priority, Dashboard,
 * OPSP) consumes to size its grid in Custom Quarter Settings mode.
 */
export function useQuarterWeekCount(
  year: number | null | undefined,
  quarter: string | null | undefined,
): number {
  const [count, setCount] = useState<number>(DEFAULT_WEEKS_PER_QUARTER);

  useEffect(() => {
    if (!year || !quarter) {
      setCount(DEFAULT_WEEKS_PER_QUARTER);
      return;
    }
    (async () => {
      await ensureLoaded();
      const match = cache?.find((q) => q.fiscalYear === year && q.quarter === quarter);
      setCount(rowWeekCount(match));
    })();
  }, [year, quarter]);

  return count;
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
  const meetingDay = useEffectiveMeetingDay();

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
      // Custom Quarter Settings: meeting-day aligned weeks incl. partial weeks
      // (13 or 14). Null meeting day → legacy uniform calendar weeks.
      const idx = meetingDayIndex(meetingDay);
      if (idx !== null) {
        const weeks = generateMeetingDayWeeks(match.startDate, match.endDate, idx);
        setLabels(weeks.map((w) => formatCompactWeekLabel(w.start, w.end)));
        return;
      }
      const start = new Date(match.startDate);
      const out: string[] = [];
      const weekCount = rowWeekCount(match);
      for (let w = 1; w <= weekCount; w++) {
        const ws = new Date(start);
        ws.setDate(ws.getDate() + (w - 1) * 7);
        const we = new Date(ws);
        we.setDate(we.getDate() + 6);
        out.push(formatCompactWeekLabel(ws, we));
      }
      setLabels(out);
    })();
  }, [year, quarter, meetingDay]);

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
  const meetingDay = useEffectiveMeetingDay();

  useEffect(() => {
    if (!year || !quarter || !weekNumber || weekNumber < 1 || weekNumber > MAX_WEEKS_PER_QUARTER) {
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
      const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      // Custom Quarter Settings: meeting-day aligned weeks incl. partial weeks.
      // Null meeting day → legacy uniform calendar weeks.
      const idx = meetingDayIndex(meetingDay);
      if (idx !== null) {
        const weeks = generateMeetingDayWeeks(match.startDate, match.endDate, idx);
        const wk = weeks[weekNumber - 1];
        setRange(wk ? `${fmt(wk.start)} – ${fmt(wk.end)}` : null);
        return;
      }
      const start = new Date(match.startDate);
      const weekStart = new Date(start);
      weekStart.setDate(weekStart.getDate() + (weekNumber - 1) * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      setRange(`${fmt(weekStart)} – ${fmt(weekEnd)}`);
    })();
  }, [year, quarter, weekNumber, meetingDay]);

  return range;
}

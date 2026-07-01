"use client";

import { useEffect, useState } from "react";

export interface PastWeekFlags {
  canAddPastWeek: boolean;
  canEditPastWeek: boolean;
  /** `add_past_quarter_habit` — when on, the Habits modal lets admins create
   *  assessments for quarters whose configured period has already ended. */
  canAddPastQuarterHabit: boolean;
  loaded: boolean;
}

interface FlagRow {
  key: string;
  enabled: boolean;
  value?: string | null;
}

// Module-level cache + version for invalidation
let cache: {
  canAddPastWeek: boolean;
  canEditPastWeek: boolean;
  canAddPastQuarterHabit: boolean;
  useIndianNumbering: boolean;
  wwwNotesRequired: boolean;
  customQuarterSettings: boolean;
  weeklyMeetingDay: string | null;
} | null = null;
let version = 0;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((l) => l());
}

function emptyFlags(): NonNullable<typeof cache> {
  return {
    canAddPastWeek: false,
    canEditPastWeek: false,
    canAddPastQuarterHabit: false,
    useIndianNumbering: false,
    wwwNotesRequired: false,
    customQuarterSettings: false,
    weeklyMeetingDay: null,
  };
}

async function fetchFlags() {
  try {
    const res = await fetch("/api/settings/configurations", { cache: "no-store" });
    const json = await res.json();
    if (json.success) {
      const rows: FlagRow[] = json.data;
      cache = {
        canAddPastWeek: rows.find((f) => f.key === "add_past_week_data")?.enabled ?? false,
        canEditPastWeek: rows.find((f) => f.key === "edit_past_week_data")?.enabled ?? false,
        canAddPastQuarterHabit:
          rows.find((f) => f.key === "add_past_quarter_habit")?.enabled ?? false,
        useIndianNumbering: rows.find((f) => f.key === "use_indian_numbering")?.enabled ?? false,
        wwwNotesRequired: rows.find((f) => f.key === "www_notes_required")?.enabled ?? false,
        customQuarterSettings:
          rows.find((f) => f.key === "enable_custom_quarter_settings")?.enabled ?? false,
        weeklyMeetingDay: rows.find((f) => f.key === "weekly_meeting_day")?.value ?? null,
      };
    } else {
      cache = emptyFlags();
    }
  } catch {
    cache = emptyFlags();
  }
  version++;
  notifyListeners();
}

/**
 * Client-side hook that returns the "past week data" feature flags.
 * Subscribes to cache updates — any call to `invalidateFeatureFlagsCache()`
 * triggers re-fetch and re-renders all consumers.
 */
export function usePastWeekFlags(): PastWeekFlags {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    // Re-render listener
    const listener = () => forceUpdate((n) => n + 1);
    listeners.add(listener);

    // Always re-fetch on mount (stale-while-revalidate: UI shows cached value first,
    // then re-renders with fresh data once fetch completes)
    fetchFlags();

    return () => {
      listeners.delete(listener);
    };
  }, []);

  return {
    canAddPastWeek: cache?.canAddPastWeek ?? false,
    canEditPastWeek: cache?.canEditPastWeek ?? false,
    canAddPastQuarterHabit: cache?.canAddPastQuarterHabit ?? false,
    loaded: cache !== null,
  };
}

/**
 * Dashboard number-format preference, derived from the org-level
 * `use_indian_numbering` config flag. Returns `"indian"` (lakh/crore/arab) when
 * enabled, else `"standard"` (K/M/B). Subscribes to the same flag cache as
 * `usePastWeekFlags`, so toggling the setting re-renders the dashboard.
 */
export function useNumberFormat(): "standard" | "indian" {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const listener = () => forceUpdate((n) => n + 1);
    listeners.add(listener);
    fetchFlags();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return cache?.useIndianNumbering ? "indian" : "standard";
}

/**
 * Whether the org requires a non-empty Notes field on WWW items (the
 * `www_notes_required` config flag). Subscribes to the same flag cache, so
 * toggling the setting re-renders the WWW add/edit form live.
 */
export function useWWWNotesRequired(): boolean {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const listener = () => forceUpdate((n) => n + 1);
    listeners.add(listener);
    fetchFlags();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return cache?.wwwNotesRequired ?? false;
}

/**
 * Whether the org has Custom Quarter Settings enabled (`enable_custom_quarter_settings`).
 * When on, quarters can have a custom week count (≠ 13) and editable dates.
 * Subscribes to the same flag cache so toggling re-renders consumers live.
 */
export function useCustomQuarterSettings(): boolean {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const listener = () => forceUpdate((n) => n + 1);
    listeners.add(listener);
    fetchFlags();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return cache?.customQuarterSettings ?? false;
}

/**
 * The org's configured weekly meeting day (`weekly_meeting_day`, e.g. "Wednesday"),
 * or null when unset. Informational — does not change week boundaries.
 */
export function useWeeklyMeetingDay(): string | null {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const listener = () => forceUpdate((n) => n + 1);
    listeners.add(listener);
    fetchFlags();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return cache?.weeklyMeetingDay ?? null;
}

/** Force-refresh the cached flags (call after Settings page saves changes). */
export function invalidateFeatureFlagsCache() {
  cache = null;
  fetchFlags(); // Re-fetch immediately and notify listeners
}

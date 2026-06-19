"use client";

import { useEffect, useState } from "react";

export interface PastWeekFlags {
  canAddPastWeek: boolean;
  canEditPastWeek: boolean;
  loaded: boolean;
}

interface FlagRow {
  key: string;
  enabled: boolean;
}

// Module-level cache + version for invalidation
let cache: { canAddPastWeek: boolean; canEditPastWeek: boolean } | null = null;
let version = 0;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((l) => l());
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
      };
    } else {
      cache = { canAddPastWeek: false, canEditPastWeek: false };
    }
  } catch {
    cache = { canAddPastWeek: false, canEditPastWeek: false };
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
    loaded: cache !== null,
  };
}

/** Force-refresh the cached flags (call after Settings page saves changes). */
export function invalidateFeatureFlagsCache() {
  cache = null;
  fetchFlags(); // Re-fetch immediately and notify listeners
}

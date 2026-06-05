"use client";

import { useCallback, useEffect, useState } from "react";
import { unwrap } from "@/lib/utils/api-fetch";
import type { HookResult, StatsResponse } from "./client-types";

/**
 * KPI strip data source — Replies sent / Success rate / Avg response /
 * Active rules. Single call to GET /api/auto-reply/stats.
 */
export function useAutoReplyStats(
  brandId: string | null,
  windowDays = 7,
): HookResult<StatsResponse> {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(
    async (signal?: AbortSignal) => {
      if (!brandId) {
        setData(null);
        setLoading(false);
        return;
      }
      setError(null);
      try {
        const url = `/api/auto-reply/stats?brandId=${encodeURIComponent(brandId)}&windowDays=${windowDays}`;
        const res = await fetch(url, { credentials: "include", signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setData(unwrap<StatsResponse>(await res.json()));
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        setError("Couldn't load stats.");
      } finally {
        setLoading(false);
      }
    },
    [brandId, windowDays],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void fetchStats(controller.signal);
    return () => controller.abort();
  }, [fetchStats]);

  return {
    data,
    loading,
    error,
    refetch: () => void fetchStats(),
  };
}

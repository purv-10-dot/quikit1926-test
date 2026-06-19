"use client";

import { useCallback, useEffect, useState } from "react";
import { unwrap } from "@/lib/utils/api-fetch";
import type { HookResult, LogRow, LogStatus } from "./client-types";

const PAGE_SIZE = 20;

export type ActivityFilter = "all" | Lowercase<LogStatus>;

type LogsState = {
  logs: LogRow[];
  total: number;
  hasMore: boolean;
};

/**
 * Paginated logs feed with status filter. "Load more" appends to the
 * existing list; filter or brand change resets to page 0.
 */
export function useAutoReplyLogs(
  brandId: string | null,
  filter: ActivityFilter,
): HookResult<LogsState> & {
  loadMore: () => Promise<void>;
  loadingMore: boolean;
} {
  const [data, setData] = useState<LogsState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState<number>(0);

  // Filter is applied client-side on a fetched page (the API filters by
  // ruleId, not by status). Reset offset whenever brand or filter changes
  // so the new query starts from page 0.
  const fetchPage = useCallback(
    async (
      append: boolean,
      pageOffset: number,
      signal?: AbortSignal,
    ): Promise<void> => {
      if (!brandId) {
        setData({ logs: [], total: 0, hasMore: false });
        setLoading(false);
        return;
      }
      setError(null);
      try {
        const url = `/api/auto-reply/logs?brandId=${encodeURIComponent(brandId)}&limit=${PAGE_SIZE}&offset=${pageOffset}`;
        const res = await fetch(url, { credentials: "include", signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = unwrap<{
          logs: LogRow[];
          total: number;
          hasMore: boolean;
        }>(await res.json());
        setData((prev) =>
          append && prev
            ? {
                logs: [...prev.logs, ...body.logs],
                total: body.total,
                hasMore: body.hasMore,
              }
            : body,
        );
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        setError("Couldn't load activity. Check your connection and try again.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [brandId],
  );

  // Reset on brand or filter change.
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setOffset(0);
    void fetchPage(false, 0, controller.signal);
    return () => controller.abort();
    // filter is intentionally a dep so we reset offset when it changes,
    // even though the API doesn't filter by status — keeping the UX simple.
  }, [fetchPage, filter]);

  const loadMore = useCallback(async () => {
    if (!data?.hasMore || loadingMore) return;
    const next = offset + PAGE_SIZE;
    setLoadingMore(true);
    setOffset(next);
    await fetchPage(true, next);
  }, [data?.hasMore, fetchPage, loadingMore, offset]);

  // Client-side filter — applied to the accumulated list.
  const filteredData: LogsState | null = data
    ? {
        ...data,
        logs:
          filter === "all"
            ? data.logs
            : data.logs.filter(
                (l) => l.status.toLowerCase() === filter,
              ),
      }
    : null;

  return {
    data: filteredData,
    loading,
    error,
    refetch: () => {
      setOffset(0);
      setLoading(true);
      void fetchPage(false, 0);
    },
    loadMore,
    loadingMore,
  };
}

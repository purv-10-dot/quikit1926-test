"use client";

/**
 * Infinite-scroll list hooks for the Dashboard KPI / Priority / WWW sections.
 *
 * Each hook drives `useInfiniteQuery` against its module list API, fetching 25
 * rows per page and accumulating pages into a flat `rows` array. The `filters`
 * object is part of the query key, so changing the search term (or any filter)
 * automatically resets to page 1 and refetches — satisfying the "reset on
 * search" requirement without manual page bookkeeping. State is fully
 * independent per hook instance, so scrolling one section never triggers a
 * fetch in another.
 *
 * Envelopes differ between the modules, so each hook parses its own shape:
 *   - KPI:            { success, data: { kpis, total, page, pageSize, hasMore } }
 *   - Priority / WWW: { success, data: [...], meta: { page, total, hasMore, ... } }
 */

import { useInfiniteQuery, keepPreviousData } from "@tanstack/react-query";
import { useMemo } from "react";
import type { KPIRow } from "@/lib/types/kpi";
import type { PriorityRow } from "@/lib/types/priority";
import type { WWWItem } from "@/lib/types/www";

export const DASHBOARD_INFINITE_PAGE_SIZE = 25;

export type ListFilters = Record<string, string | number | boolean | undefined | null>;

function buildQuery(filters: ListFilters, page: number, limit: number): string {
  const p = new URLSearchParams();
  p.set("page", String(page));
  p.set("limit", String(limit));
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === null || v === "") continue;
    p.set(k, String(v));
  }
  return p.toString();
}

/** Common return shape so the three section wrappers can stay symmetric. */
export interface InfiniteListResult<T> {
  rows: T[];
  total: number;
  isLoading: boolean;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  refetch: () => void;
  isError: boolean;
  error: unknown;
}

interface KpiEnvelope {
  success: boolean;
  data: { kpis: KPIRow[]; total: number; page: number; pageSize: number; hasMore: boolean };
  error?: string;
}

interface PagedEnvelope<T> {
  success: boolean;
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number; hasMore: boolean };
  error?: string;
}

export function useInfiniteKPIs(filters: ListFilters, enabled = true): InfiniteListResult<KPIRow> {
  const query = useInfiniteQuery({
    queryKey: ["kpi-infinite", filters],
    queryFn: async ({ pageParam, signal }) => {
      const res = await fetch(`/api/kpi?${buildQuery(filters, pageParam, DASHBOARD_INFINITE_PAGE_SIZE)}`, { signal });
      const json = (await res.json()) as KpiEnvelope;
      if (!json.success) throw new Error(json.error || "Failed to load KPIs");
      return json.data;
    },
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    staleTime: 1000 * 60 * 5,
    placeholderData: keepPreviousData,
    enabled,
  });

  const rows = useMemo(() => (query.data?.pages ?? []).flatMap((p) => p.kpis), [query.data]);
  const pages = query.data?.pages;
  const total = pages && pages.length ? pages[pages.length - 1].total : 0;

  return {
    rows,
    total,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: !!query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
    isError: query.isError,
    error: query.error,
  };
}

function usePagedInfinite<T>(
  endpoint: string,
  keyPrefix: string,
  filters: ListFilters,
  enabled: boolean,
): InfiniteListResult<T> {
  const query = useInfiniteQuery({
    queryKey: [keyPrefix, filters],
    queryFn: async ({ pageParam, signal }) => {
      const res = await fetch(`${endpoint}?${buildQuery(filters, pageParam, DASHBOARD_INFINITE_PAGE_SIZE)}`, { signal });
      const json = (await res.json()) as PagedEnvelope<T>;
      if (!json.success) throw new Error(json.error || "Failed to load");
      return json;
    },
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.hasMore ? last.meta.page + 1 : undefined),
    staleTime: 1000 * 60 * 5,
    placeholderData: keepPreviousData,
    enabled,
  });

  const rows = useMemo(() => (query.data?.pages ?? []).flatMap((p) => p.data), [query.data]);
  const pages = query.data?.pages;
  const total = pages && pages.length ? pages[pages.length - 1].meta.total : 0;

  return {
    rows,
    total,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: !!query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
    isError: query.isError,
    error: query.error,
  };
}

export function useInfinitePriorities(filters: ListFilters, enabled = true): InfiniteListResult<PriorityRow> {
  return usePagedInfinite<PriorityRow>("/api/priority", "priority-infinite", filters, enabled);
}

export function useInfiniteWWW(filters: ListFilters, enabled = true): InfiniteListResult<WWWItem> {
  return usePagedInfinite<WWWItem>("/api/www", "www-infinite", filters, enabled);
}

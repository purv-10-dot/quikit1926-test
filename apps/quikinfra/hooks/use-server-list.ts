"use client";

/**
 * useServerList — server-side pagination for list screens using a classic
 * numbered pager (page / pageSize → the server does skip/take). Offset
 * based, React Query under the hood. One page of rows is held at a time;
 * changing page / pageSize / search / sort / filters refetches that page.
 *
 * Server contract (what every paginated list route returns via paginateDb):
 *   { data: T[], total, page, pageSize, hasMore }
 *
 * Changing search / sort / filters / pageSize resets back to page 1.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/react-query/fetch-json";

export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

export interface ServerListParams {
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  initialPageSize?: number;
  filters?: Record<string, string | undefined>;
}

interface PageEnvelope<T> {
  data: T[];
  total?: number;
  page?: number;
  pageSize?: number;
  hasMore?: boolean;
}

export interface ServerListResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  setPage: (p: number) => void;
  setPageSize: (n: number) => void;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
}

export function useServerList<T>(
  key: string,
  endpoint: string,
  params: ServerListParams = {},
  options?: { enabled?: boolean },
): ServerListResult<T> {
  const search = params.search ?? "";
  const sortBy = params.sortBy ?? "";
  const sortOrder = params.sortOrder ?? "asc";
  const filters = params.filters ?? {};
  const filterKey = JSON.stringify(filters);

  // The list cache is keyed on the entity's *base* name so a mutation that
  // invalidates ["customers"] also matches this server-paginated list —
  // React Query matches by array prefix, and "customers-infinite" is NOT a
  // prefix of "customers". Strip the "-infinite" suffix and carry it as its
  // own segment so the paginated cache still reads distinctly in devtools
  // while sharing the base prefix the create/update/delete hooks invalidate.
  const baseKey = key.replace(/-infinite$/, "");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(params.initialPageSize ?? DEFAULT_PAGE_SIZE);

  // Any change to the query criteria (search / sort / filters / page size)
  // resets to page 1 — otherwise you could land on a now-out-of-range page.
  useEffect(() => {
    setPage(1);
  }, [search, sortBy, sortOrder, filterKey, pageSize]);

  const query = useQuery<PageEnvelope<T>>({
    queryKey: [baseKey, "infinite", endpoint, page, pageSize, search, sortBy, sortOrder, filterKey],
    enabled: options?.enabled ?? true,
    // Keep the previous page visible while the next loads (no flash).
    placeholderData: (prev) => prev,
    queryFn: () => {
      const qs = new URLSearchParams();
      qs.set("page", String(page));
      qs.set("pageSize", String(pageSize));
      if (search) qs.set("search", search);
      if (sortBy) {
        qs.set("sortBy", sortBy);
        qs.set("sortOrder", sortOrder);
      }
      for (const [k, v] of Object.entries(filters)) {
        if (v != null && v !== "") qs.set(k, v);
      }
      return fetchJson<PageEnvelope<T>>(`${endpoint}?${qs.toString()}`);
    },
  });

  const items = useMemo(() => query.data?.data ?? [], [query.data]);

  return {
    items,
    total: query.data?.total ?? 0,
    page,
    pageSize,
    setPage,
    setPageSize,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: () => query.refetch(),
  };
}

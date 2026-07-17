"use client";

/**
 * useServerTabList — server-side numbered-pager list for transactional pages
 * that have status tabs with count badges (Purchase Orders, PR, GRN, RFQ,
 * Indent, Store issues/transfers, …).
 *
 * Combines {@link useServerList} (one page of the active tab, offset pager)
 * with a lightweight `?counts=1` query (one groupBy-per-status) so the tab
 * badges stay accurate. The list route must support `?counts=1` →
 * `{ counts: Record<status, n> }` over the same search/filters.
 *
 * Tab keys equal the row's `status` value ("all" = no status filter).
 */

import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/react-query/fetch-json";
import { useServerList, type ServerListResult } from "@/hooks/use-server-list";
import type { TabSpec, TabWithCount } from "@/lib/tab-counts";

export interface ServerTabListParams {
  activeTab: string;
  tabs: TabSpec[];
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  initialPageSize?: number;
  extraFilters?: Record<string, string | undefined>;
}

export interface ServerTabListResult<T> extends ServerListResult<T> {
  tabs: TabWithCount[];
}

const ALL_KEY = "all";

export function useServerTabList<T>(
  key: string,
  endpoint: string,
  params: ServerTabListParams,
): ServerTabListResult<T> {
  const { activeTab, tabs, search, sortBy, sortOrder, initialPageSize, extraFilters } = params;

  const status = activeTab && activeTab !== ALL_KEY ? activeTab : undefined;

  const list = useServerList<T>(key, endpoint, {
    search,
    sortBy,
    sortOrder,
    initialPageSize,
    filters: { ...(extraFilters ?? {}), ...(status ? { status } : {}) },
  });

  const extraKey = JSON.stringify(extraFilters ?? {});
  const countsQuery = useQuery({
    queryKey: [key, "counts", endpoint, search ?? "", extraKey],
    queryFn: () => {
      const qs = new URLSearchParams({ counts: "1" });
      if (search) qs.set("search", search);
      for (const [k, v] of Object.entries(extraFilters ?? {})) {
        if (v != null && v !== "") qs.set(k, v);
      }
      return fetchJson<{ counts: Record<string, number> }>(
        `${endpoint}?${qs.toString()}`,
      );
    },
  });

  const counts = countsQuery.data?.counts ?? {};
  const grandTotal = Object.values(counts).reduce((a, b) => a + b, 0);

  const tabsWithCounts: TabWithCount[] = tabs.map((t) =>
    t.key === ALL_KEY
      ? { key: t.key, label: t.label, count: grandTotal }
      : { key: t.key, label: t.label, count: counts[t.key] ?? 0 },
  );

  return { ...list, tabs: tabsWithCounts };
}

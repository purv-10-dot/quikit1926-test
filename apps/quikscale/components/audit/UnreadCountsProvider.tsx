"use client";

/**
 * Batches per-entity audit unread-count lookups for a list page.
 *
 * Previously every row's <HistoryButton> fired its own
 * `/api/audit/unread-count?entityId=…` request (one network call per row).
 * Wrap the table in <UnreadCountsProvider entityType ids={pageRowIds}> and the
 * counts for the whole page are fetched in ONE request; <HistoryButton> reads
 * its value from context and skips its individual fetch.
 *
 * Non-breaking: if no provider is mounted, <HistoryButton> falls back to its
 * original single-entity query.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

const UnreadCountsContext = createContext<Map<string, number> | null>(null);

/** One batched request for the unread counts of `ids` (entity type scoped). */
export function useUnreadCounts(entityType: string, ids: string[]) {
  const key = [...ids].sort().join(",");
  return useQuery({
    queryKey: ["audit-unread-counts", entityType, key],
    queryFn: async () => {
      const res = await fetch(
        `/api/audit/unread-count?entityType=${encodeURIComponent(entityType)}&entityIds=${encodeURIComponent(key)}`,
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Failed to load unread counts");
      return (json.data?.counts ?? {}) as Record<string, number>;
    },
    enabled: ids.length > 0,
    staleTime: 1000 * 30,
  });
}

export function UnreadCountsProvider({
  entityType,
  ids,
  children,
}: {
  entityType: string;
  ids: string[];
  children: ReactNode;
}) {
  const { data } = useUnreadCounts(entityType, ids);
  const map = useMemo(
    () => new Map<string, number>(Object.entries(data ?? {})),
    [data],
  );
  return <UnreadCountsContext.Provider value={map}>{children}</UnreadCountsContext.Provider>;
}

/** True when a provider is mounted (so callers can disable their own fetch). */
export function useHasUnreadCountsProvider(): boolean {
  return useContext(UnreadCountsContext) !== null;
}

/** Unread count for one entity from the batched provider, or null if none. */
export function useUnreadCountFromContext(entityId: string): number | null {
  const map = useContext(UnreadCountsContext);
  if (!map) return null;
  return map.get(entityId) ?? 0;
}

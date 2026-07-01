"use client";

/**
 * Generic infinite-scroll option source for large dropdowns.
 *
 * This is the reusable primitive behind the app's large-dropdown strategy:
 * any picker backed by a paginated, searchable endpoint can load 25 rows at a
 * time and append on scroll-end instead of pulling the whole list.
 *
 * It consumes the repo's standard list envelope (the one `paginatedResponse`
 * emits):
 *   { success: true, data: T[], meta: { page, limit, total, totalPages, hasMore } }
 *
 * Pairs with the `@quikit/ui` pickers (`UserSelect`/`UserMultiPicker`/
 * `FilterPicker`) — wire `options`→options, `fetchNextPage`→`onLoadMore`,
 * `hasNextPage`→`hasMore`, `isFetchingNextPage`→`loadingMore`, and feed the
 * picker's `onSearchChange` back into this hook's `search` argument.
 *
 *   const { options, hasNextPage, isFetchingNextPage, fetchNextPage } =
 *     useInfiniteOptions<UserRow, FilterOption>({
 *       queryKey: ["users-infinite", teamId ?? "all", search],
 *       endpoint: "/api/users",
 *       search,
 *       filters: { teamId, sortBy: "firstName" },
 *       toOption: userToFilterOption,
 *     });
 *
 * The existing `useInfiniteUsers` / `useInfiniteClientMembers` predate this and
 * keep their own (cache-key-stable) implementations; use this for NEW large
 * dropdowns so they don't each hand-roll the same useInfiniteQuery wiring.
 */
import { useInfiniteQuery, keepPreviousData } from "@tanstack/react-query";
import { useMemo } from "react";

interface ListEnvelope<T> {
  success: boolean;
  data: T[];
  error?: string;
  meta?: { page: number; totalPages?: number; hasMore?: boolean; total?: number };
}

export interface UseInfiniteOptionsArgs<TRow, TOption> {
  /** Stable React Query key. Include `search` + any `filters` so changing them
   *  resets to page 1 (a new key) and refetches. */
  queryKey: readonly unknown[];
  /** List endpoint returning the standard `{ success, data, meta }` envelope. */
  endpoint: string;
  /** Map a server row → the picker's option shape. MUST be stable (useCallback). */
  toOption: (row: TRow) => TOption;
  /** Debounced server-side search term (the caller debounces / the picker does). */
  search?: string;
  /** Extra query params merged into every request (teamId, clientId, sortBy…). */
  filters?: Record<string, string | undefined>;
  /** Page size — default 25. */
  pageSize?: number;
  enabled?: boolean;
  staleTime?: number;
}

export interface UseInfiniteOptionsResult<TOption> {
  options: TOption[];
  total: number;
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  refetch: () => void;
}

export function useInfiniteOptions<TRow, TOption>(
  args: UseInfiniteOptionsArgs<TRow, TOption>,
): UseInfiniteOptionsResult<TOption> {
  const {
    queryKey, endpoint, toOption, search = "", filters = {},
    pageSize = 25, enabled = true, staleTime = 5 * 60_000,
  } = args;

  const query = useInfiniteQuery({
    queryKey,
    enabled,
    initialPageParam: 1,
    staleTime,
    placeholderData: keepPreviousData,
    queryFn: async ({ pageParam, signal }) => {
      const sp = new URLSearchParams({ page: String(pageParam), limit: String(pageSize) });
      if (search.trim()) sp.set("search", search.trim());
      for (const [k, v] of Object.entries(filters)) if (v) sp.set(k, v);
      const res = await fetch(`${endpoint}?${sp.toString()}`, { signal });
      const json = (await res.json()) as ListEnvelope<TRow>;
      if (!json.success) throw new Error(json.error || "Failed to load options");
      return json;
    },
    getNextPageParam: (last) => {
      const m = last.meta;
      if (!m) return undefined;
      const more = m.hasMore ?? (m.totalPages != null ? m.page < m.totalPages : false);
      return more ? m.page + 1 : undefined;
    },
  });

  const options = useMemo(
    () => (query.data?.pages ?? []).flatMap((p) => p.data.map(toOption)),
    [query.data, toOption],
  );
  const total = query.data?.pages?.[0]?.meta?.total ?? options.length;

  return {
    options,
    total,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: !!query.hasNextPage,
    fetchNextPage: () => void query.fetchNextPage(),
    refetch: () => void query.refetch(),
  };
}

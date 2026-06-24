"use client";

/**
 * Infinite-scroll user list hook for dropdown pickers.
 *
 * Fetches `/api/users` 25 at a time, sorted alphabetically by firstName
 * (server-side). `users` accumulates pages as the caller fires `fetchNextPage`,
 * which makes it a drop-in replacement for static user arrays in pickers that
 * support an `onLoadMore` callback.
 *
 * Pair with `FilterPicker` / `UserSelect` (in `@quikit/ui`) — they accept
 * optional `onLoadMore` / `hasMore` / `loadingMore` props which can be wired
 * directly to this hook's return values.
 *
 * When the picker filters by team, pass `teamId` so the API restricts to
 * actual `OrgMember.teamId` membership.
 */

import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { User } from "@/lib/types/kpi";

interface PaginatedUsersResponse {
  success: boolean;
  data: User[];
  meta: { page: number; limit: number; total: number; totalPages: number };
  error?: string;
}

export const USERS_PAGE_SIZE = 25;

async function fetchUsersPage(opts: { teamId?: string; search?: string; page: number; signal?: AbortSignal }): Promise<PaginatedUsersResponse> {
  const params = new URLSearchParams();
  params.set("page", String(opts.page));
  params.set("limit", String(USERS_PAGE_SIZE));
  params.set("sortBy", "firstName");
  if (opts.teamId) params.set("teamId", opts.teamId);
  if (opts.search) params.set("search", opts.search);
  const res = await fetch(`/api/users?${params.toString()}`, { signal: opts.signal });
  const data = (await res.json()) as PaginatedUsersResponse;
  if (!data.success) throw new Error(data.error || "Failed to fetch users");
  return data;
}

/**
 * @param teamId  Restrict to a team's members (omit for all org members).
 * @param search  Server-side name/email search. Included in the query key so
 *                changing it resets to page 1 and refetches. An empty/whitespace
 *                search shares the same cache key as `undefined`, so the
 *                unfiltered list and the picker can dedupe to one request.
 */
export function useInfiniteUsers(teamId?: string, search?: string) {
  const normalizedSearch = (search ?? "").trim();
  const query = useInfiniteQuery({
    queryKey: ["users-infinite", teamId ?? "all", normalizedSearch],
    queryFn: ({ pageParam, signal }) => fetchUsersPage({ teamId, search: normalizedSearch, page: pageParam, signal }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.meta;
      return page < totalPages ? page + 1 : undefined;
    },
    staleTime: 1000 * 60 * 5,
  });

  const users = useMemo(
    () => (query.data?.pages ?? []).flatMap((p) => p.data),
    [query.data],
  );

  return {
    users,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    hasNextPage: !!query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
  };
}

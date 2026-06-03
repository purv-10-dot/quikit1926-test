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

async function fetchUsersPage(opts: { teamId?: string; page: number }): Promise<PaginatedUsersResponse> {
  const params = new URLSearchParams();
  params.set("page", String(opts.page));
  params.set("limit", String(USERS_PAGE_SIZE));
  params.set("sortBy", "firstName");
  if (opts.teamId) params.set("teamId", opts.teamId);
  const res = await fetch(`/api/users?${params.toString()}`);
  const data = (await res.json()) as PaginatedUsersResponse;
  if (!data.success) throw new Error(data.error || "Failed to fetch users");
  return data;
}

export function useInfiniteUsers(teamId?: string) {
  const query = useInfiniteQuery({
    queryKey: ["users-infinite", teamId ?? "all"],
    queryFn: ({ pageParam }) => fetchUsersPage({ teamId, page: pageParam }),
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

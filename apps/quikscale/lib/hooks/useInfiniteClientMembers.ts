"use client";

/**
 * Infinite-scroll client-member list for dropdown pickers (Absent Member,
 * Weekly Dashboard NA). Fetches `/api/client-meetings/members` 25 at a time
 * (server-paginated + server-searched) and accumulates pages as the picker
 * fires `fetchNextPage` on scroll-end — so we never pull the full roster in
 * one call.
 *
 * Pairs with `UserMultiPicker` / `UserSelect` (@quikit/ui): wire `onLoadMore`
 * → `fetchNextPage`, `hasMore` → `hasNextPage`, `loadingMore` →
 * `isFetchingNextPage`, `onSearchChange` → set the `search` arg.
 */
import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { PickerUser } from "@quikit/ui";

export const CLIENT_MEMBERS_PAGE_SIZE = 25;

interface ClientMemberRow {
  id: string;
  name: string;
  email: string;
}
interface PaginatedMembersResponse {
  success: boolean;
  data: ClientMemberRow[];
  meta: { page: number; limit: number; total: number; totalPages: number };
  error?: string;
}

/** ClientMember stores a single `name`; split it into first/last for the picker. */
function toPickerUser(m: ClientMemberRow): PickerUser {
  const parts = m.name.trim().split(/\s+/);
  return {
    id: m.id,
    firstName: parts[0] ?? m.name,
    lastName: parts.slice(1).join(" "),
    email: m.email,
  };
}

async function fetchMembersPage(opts: { page: number; search: string; clientId?: string; signal?: AbortSignal }): Promise<PaginatedMembersResponse> {
  const params = new URLSearchParams();
  params.set("page", String(opts.page));
  params.set("limit", String(CLIENT_MEMBERS_PAGE_SIZE));
  params.set("sortBy", "name");
  params.set("sortOrder", "asc");
  if (opts.search) params.set("search", opts.search);
  if (opts.clientId) params.set("clientId", opts.clientId);
  const res = await fetch(`/api/client-meetings/members?${params.toString()}`, { signal: opts.signal });
  const json = (await res.json()) as PaginatedMembersResponse;
  if (!json.success) throw new Error(json.error || "Failed to fetch members");
  return json;
}

/**
 * @param clientId Restrict to one client's roster (omit for all org members).
 * @param search   Server-side name/email search.
 */
export function useInfiniteClientMembers(clientId?: string, search?: string) {
  const normalizedSearch = (search ?? "").trim();
  const query = useInfiniteQuery({
    queryKey: ["client-members-infinite", clientId ?? "all", normalizedSearch],
    queryFn: ({ pageParam, signal }) => fetchMembersPage({ page: pageParam, search: normalizedSearch, clientId, signal }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.meta;
      return page < totalPages ? page + 1 : undefined;
    },
    staleTime: 1000 * 60 * 5,
  });

  const members = useMemo(
    () => (query.data?.pages ?? []).flatMap((p) => p.data).map(toPickerUser),
    [query.data],
  );

  return {
    members,
    isLoading: query.isLoading,
    hasNextPage: !!query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
  };
}

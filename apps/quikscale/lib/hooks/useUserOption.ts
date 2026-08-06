"use client";

/**
 * Resolves a single user id to a `FilterOption` so an owner/who `FilterPicker`
 * can display the APPLIED owner's name + avatar even when that user isn't in
 * the loaded (paginated) options AND the filtered list is empty.
 *
 * Pass the result to `FilterPicker` as `selectedOption`. The picker only falls
 * back to it when the id isn't already in its `options` slice, so there's no
 * conflict with the normal (owner-in-loaded-page) path.
 *
 * Backed by `GET /api/users/[id]`; the query is disabled (no fetch) until an
 * id is supplied, and cached for 5 min so revisiting a filter is instant.
 */

import { useQuery, useQueries } from "@tanstack/react-query";
import { userToFilterOption, type FilterOption } from "@quikit/ui";
import type { User } from "@/lib/types/kpi";

async function fetchUserById(id: string): Promise<User> {
  const res = await fetch(`/api/users/${encodeURIComponent(id)}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to fetch user");
  return data.data as User;
}

export function useUserOption(userId?: string): FilterOption | undefined {
  const { data } = useQuery({
    queryKey: ["user-option", userId ?? ""],
    queryFn: () => fetchUserById(userId!),
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
  });

  return data ? userToFilterOption(data) : undefined;
}

/**
 * Multi-select counterpart of `useUserOption` — resolves a LIST of user ids to
 * `FilterOption`s for a `FilterPicker` in `multiple` mode (pass as
 * `selectedOptions`). Shares the same per-user query keys / 5-min cache as
 * `useUserOption`, so ids already fetched by the single-select hook resolve
 * instantly and no duplicate requests are issued.
 *
 * Ids still in flight are simply omitted; the picker falls back to rendering
 * the raw id until the name lands.
 */
export function useUserOptions(userIds: string[]): FilterOption[] {
  const results = useQueries({
    queries: userIds.map((id) => ({
      queryKey: ["user-option", id],
      queryFn: () => fetchUserById(id),
      enabled: !!id,
      staleTime: 1000 * 60 * 5,
    })),
  });

  return results
    .map((r) => (r.data ? userToFilterOption(r.data as User) : undefined))
    .filter((o): o is FilterOption => Boolean(o));
}

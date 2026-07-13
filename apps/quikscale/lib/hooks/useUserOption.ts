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

import { useQuery } from "@tanstack/react-query";
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

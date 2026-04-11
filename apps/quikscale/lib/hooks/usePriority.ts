"use client";

/**
 * Priority data hooks.
 *
 * Built on `createCRUDHook` for the standard CRUD ops. The custom
 * `useUpdateWeeklyStatus` hook stays inline because it hits a sub-path
 * (`/api/priority/:id/weekly`) that doesn't fit the CRUD factory shape.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PriorityRow } from "@/lib/types/priority";
import { createCRUDHook } from "./createCRUDHook";

export interface PriorityFilters {
  year: number;
  quarter: string;
  sort?: string | null;
}

function buildListUrl(filters: PriorityFilters): string {
  const params = new URLSearchParams({
    year: String(filters.year),
    quarter: filters.quarter,
  });
  if (filters.sort) {
    const [sortBy, sortOrder] = filters.sort.split(":");
    if (sortBy) params.set("sortBy", sortBy);
    if (sortOrder) params.set("sortOrder", sortOrder);
  }
  return `/api/priority?${params.toString()}`;
}

const priority = createCRUDHook<PriorityRow, PriorityFilters>({
  resource: "priority",
  listUrl: buildListUrl,
});

// Public API — preserves the existing positional-argument signature for
// `usePriorities(year, quarter, sort?)` so call sites don't need to change.
export function usePriorities(year: number, quarter: string, sort?: string | null) {
  return priority.useList({ year, quarter, sort });
}

export const useCreatePriority = priority.useCreate;
export const useUpdatePriority = priority.useUpdate;
export const useDeletePriority = priority.useDelete;

// ── Custom sub-resource: weekly status ─────────────────────────────────────
//
// Updates /api/priority/:id/weekly — doesn't fit the CRUD factory shape
// because it's a child resource under the priority, not a variant of the
// main priority record.

async function updateWeeklyStatus(
  priorityId: string,
  body: { weekNumber: number; status: string; notes?: string }
): Promise<unknown> {
  const res = await fetch(`/api/priority/${priorityId}/weekly`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to update weekly status");
  return data.data;
}

export function useUpdateWeeklyStatus(priorityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { weekNumber: number; status: string; notes?: string }) =>
      updateWeeklyStatus(priorityId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: priority.keys.detail(priorityId) });
      queryClient.invalidateQueries({ queryKey: priority.keys.lists() });
    },
  });
}

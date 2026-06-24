"use client";

/**
 * Priority data hooks.
 *
 * Built on `createCRUDHook` for the standard CRUD ops. The custom
 * `useUpdateWeeklyStatus` hook stays inline because it hits a sub-path
 * (`/api/priority/:id/weekly`) that doesn't fit the CRUD factory shape.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PriorityRow } from "@/lib/types/priority";
import { createCRUDHook } from "./createCRUDHook";
import { invalidateEntity } from "@/lib/hooks/dashboardInvalidation";

export interface PriorityFilters {
  year: number;
  quarter: string;
  sort?: string | null;
  includeDeleted?: boolean;
  // DB-level pagination + search + filters.
  page?: number;
  limit?: number;
  search?: string;
  owner?: string;
  teamId?: string;
  status?: string;
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
  if (filters.includeDeleted) params.set("includeDeleted", "true");
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.search) params.set("search", filters.search);
  if (filters.owner) params.set("owner", filters.owner);
  if (filters.teamId) params.set("teamId", filters.teamId);
  if (filters.status) params.set("status", filters.status);
  return `/api/priority?${params.toString()}`;
}

const priority = createCRUDHook<PriorityRow, PriorityFilters>({
  resource: "priority",
  listUrl: buildListUrl,
});

// Public API — preserves the existing positional-argument signature for
// `usePriorities(year, quarter, sort?)` so call sites don't need to change.
export function usePriorities(year: number, quarter: string, sort?: string | null, includeDeleted?: boolean) {
  return priority.useList({ year, quarter, sort, includeDeleted });
}

/** DB-level paginated list — returns `{ data, meta }`, keeps previous page. */
export function usePrioritiesPaginated(filters: PriorityFilters) {
  return priority.useListPaginated(filters);
}

export const useCreatePriority = priority.useCreate;
export const useUpdatePriority = priority.useUpdate;
export const useDeletePriority = priority.useDelete;
export const useRestorePriority = priority.useRestore;
export const useBulkRestorePriority = priority.useBulkRestore;

/** Change-history log for a priority (AuditLog rows). */
export function usePriorityLogs(priorityId: string) {
  return useQuery({
    queryKey: ["priority", "logs", priorityId],
    queryFn: async () => {
      const res = await fetch(`/api/priority/${priorityId}/logs`, { cache: "no-store" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Failed to fetch logs");
      return json.data as Array<{
        id: string;
        action: string;
        oldValue: string | null;
        newValue: string | null;
        changedBy: string;
        changedByName: string;
        reason: string | null;
        createdAt: string;
      }>;
    },
    enabled: !!priorityId,
    staleTime: 1000 * 60 * 5,
  });
}

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
      // detail + list + dashboard + dashboard-infinite (single source of truth).
      invalidateEntity(queryClient, "priority", { id: priorityId });
    },
  });
}

type WeeklyStatusWrite = { weekNumber: number; status: string; notes?: string };

// Batch weekly-status save — many weeks in ONE request. The server groups
// ≥3 changed weeks into a single BULK_UPDATE audit event ("Bulk weekly update"
// card); <3 fall back to individual WEEKLY_UPDATE events. Used by the Completed
// cascade so a multi-week save is one history entry, not N.
async function updateWeeklyStatusesBatch(
  priorityId: string,
  inputs: WeeklyStatusWrite[]
): Promise<unknown> {
  const res = await fetch(`/api/priority/${priorityId}/weekly/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inputs }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to update weekly statuses");
  return data.data;
}

export function useUpdateWeeklyStatusesBatch(priorityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inputs: WeeklyStatusWrite[]) => updateWeeklyStatusesBatch(priorityId, inputs),
    onSuccess: () => {
      invalidateEntity(queryClient, "priority", { id: priorityId });
    },
  });
}

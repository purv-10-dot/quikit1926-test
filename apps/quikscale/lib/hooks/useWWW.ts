"use client";

/**
 * WWW (Who/What/When) data hooks.
 *
 * Thin wrapper around `createCRUDHook` — all the transport + cache
 * invalidation wiring lives in the factory. This file only declares the
 * WWW-specific filter shape and list URL builder.
 */
import { useQuery } from "@tanstack/react-query";
import type { WWWItem } from "@/lib/types/www";
import { createCRUDHook } from "./createCRUDHook";

export interface WWWFilters {
  search?: string;
  status?: string;
  sort?: string | null;
  includeDeleted?: boolean;
}

function buildListUrl(filters: WWWFilters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.sort) {
    const [sortBy, sortOrder] = filters.sort.split(":");
    if (sortBy) params.set("sortBy", sortBy);
    if (sortOrder) params.set("sortOrder", sortOrder);
  }
  if (filters.includeDeleted) params.set("includeDeleted", "true");
  const qs = params.toString();
  return `/api/www${qs ? `?${qs}` : ""}`;
}

const www = createCRUDHook<WWWItem, WWWFilters>({
  resource: "www",
  listUrl: buildListUrl,
});

// Public API — preserves the existing call-site names so no consumer breaks.
export const useWWWItems  = www.useList;
export const useCreateWWW = www.useCreate;
export const useUpdateWWW = www.useUpdate;
export const useDeleteWWW = www.useDelete;

/** Change-history log for a WWW item (AuditLog rows). */
export function useWWWLogs(itemId: string) {
  return useQuery({
    queryKey: ["www", "logs", itemId],
    queryFn: async () => {
      const res = await fetch(`/api/www/${itemId}/logs`, { cache: "no-store" });
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
    enabled: !!itemId,
    staleTime: 1000 * 60 * 5,
  });
}

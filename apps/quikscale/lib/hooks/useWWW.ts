"use client";

/**
 * WWW (Who/What/When) data hooks.
 *
 * Thin wrapper around `createCRUDHook` — all the transport + cache
 * invalidation wiring lives in the factory. This file only declares the
 * WWW-specific filter shape and list URL builder.
 */
import type { WWWItem } from "@/lib/types/www";
import { createCRUDHook } from "./createCRUDHook";

export interface WWWFilters {
  search?: string;
  status?: string;
  sort?: string | null;
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

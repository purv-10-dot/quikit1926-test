"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const BASE = "/api/performance/goals";

async function fetchJSON<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? "Request failed");
  return json.data as T;
}

export const goalKeys = {
  all: ["goals"] as const,
  lists: () => [...goalKeys.all, "list"] as const,
  list: (filters: Record<string, unknown>) => [...goalKeys.lists(), filters] as const,
  detail: (id: string) => [...goalKeys.all, "detail", id] as const,
};

export interface GoalsListMeta { page: number; pageSize: number; total: number; totalPages: number; }
export interface GoalsListStats { total: number; onTrack: number; atRisk: number; completed: number; }
export interface GoalsListResult<T = any> { data: T[]; meta: GoalsListMeta; stats: GoalsListStats; }

export function useGoals(filters: {
  ownerId?: string;
  quarter?: string;
  year?: number;
  status?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  page?: number;
  pageSize?: number;
} = {}) {
  const params = new URLSearchParams();
  if (filters.ownerId) params.set("ownerId", filters.ownerId);
  if (filters.quarter) params.set("quarter", filters.quarter);
  if (filters.year) params.set("year", String(filters.year));
  if (filters.status) params.set("status", filters.status);
  if (filters.search) params.set("search", filters.search);
  if (filters.sortBy) params.set("sortBy", filters.sortBy);
  if (filters.sortOrder) params.set("sortOrder", filters.sortOrder);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
  const qs = params.toString();

  return useQuery<GoalsListResult>({
    queryKey: goalKeys.list(filters),
    queryFn: async () => {
      const res = await fetch(`${BASE}${qs ? `?${qs}` : ""}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Request failed");
      return {
        data: json.data ?? [],
        meta: json.meta,
        stats: json.stats ?? { total: 0, onTrack: 0, atRisk: 0, completed: 0 },
      };
    },
    staleTime: 1000 * 60 * 5,
    placeholderData: (prev) => prev,
  });
}

export function useGoal(id: string) {
  return useQuery({
    queryKey: goalKeys.detail(id),
    queryFn: () => fetchJSON(`${BASE}/${id}`),
    enabled: !!id,
  });
}

export function useCreateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: unknown) =>
      fetchJSON(BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: goalKeys.lists() }),
  });
}

export function useUpdateGoal(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: unknown) =>
      fetchJSON(`${BASE}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: goalKeys.detail(id) });
      qc.invalidateQueries({ queryKey: goalKeys.lists() });
    },
  });
}

export function useDeleteGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetchJSON(`${BASE}/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: goalKeys.lists() }),
  });
}

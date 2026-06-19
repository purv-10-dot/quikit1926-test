"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const BASE = "/api/swt";

async function fetchJSON<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? "Request failed");
  return json.data as T;
}

export const swtKeys = {
  all:   ["swt"] as const,
  lists: () => [...swtKeys.all, "list"] as const,
  list:  (filters: Record<string, unknown>) => [...swtKeys.lists(), filters] as const,
};

export function useSWTEntries(filters: { quarter?: string; year?: number } = {}) {
  const params = new URLSearchParams();
  if (filters.quarter) params.set("quarter", filters.quarter);
  if (filters.year)    params.set("year", String(filters.year));
  const qs = params.toString();
  return useQuery({
    queryKey: swtKeys.list(filters),
    queryFn:  () => fetchJSON(`${BASE}${qs ? `?${qs}` : ""}`),
    staleTime: 1000 * 60 * 5,
  });
}

export function useCreateSWTEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: unknown) =>
      fetchJSON(BASE, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: swtKeys.lists() }),
  });
}

export function useUpdateSWTEntry(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: unknown) =>
      fetchJSON(`${BASE}/${id}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: swtKeys.lists() }),
  });
}

export function useDeleteSWTEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetchJSON(`${BASE}/${id}`, { method: "DELETE" }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: swtKeys.lists() }),
  });
}

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const BASE = "/api/performance/one-on-one";

async function fetchJSON<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? "Request failed");
  return json.data as T;
}

export const oneOnOneKeys = {
  all: ["one-on-one"] as const,
  lists: () => [...oneOnOneKeys.all, "list"] as const,
  list: (filters: Record<string, unknown>) =>
    [...oneOnOneKeys.lists(), filters] as const,
  detail: (id: string) => [...oneOnOneKeys.all, "detail", id] as const,
};

export function useOneOnOnes(
  filters: { managerId?: string; reportId?: string } = {},
) {
  const params = new URLSearchParams();
  if (filters.managerId) params.set("managerId", filters.managerId);
  if (filters.reportId) params.set("reportId", filters.reportId);
  const qs = params.toString();

  return useQuery({
    queryKey: oneOnOneKeys.list(filters),
    queryFn: () => fetchJSON(`${BASE}${qs ? `?${qs}` : ""}`),
    staleTime: 1000 * 60 * 5,
  });
}

export function useOneOnOne(id: string) {
  return useQuery({
    queryKey: oneOnOneKeys.detail(id),
    queryFn: () => fetchJSON(`${BASE}/${id}`),
    enabled: !!id,
  });
}

export function useCreateOneOnOne() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: unknown) =>
      fetchJSON(BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: oneOnOneKeys.lists() }),
  });
}

export function useUpdateOneOnOne(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: unknown) =>
      fetchJSON(`${BASE}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: oneOnOneKeys.detail(id) });
      qc.invalidateQueries({ queryKey: oneOnOneKeys.lists() });
    },
  });
}

export function useDeleteOneOnOne() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetchJSON(`${BASE}/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: oneOnOneKeys.lists() }),
  });
}

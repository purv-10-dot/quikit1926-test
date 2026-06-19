"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ChartType } from "@/lib/schemas/accountabilitySchema";

async function fetchJSON<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? "Request failed");
  return json.data as T;
}

export const accountabilityKeys = {
  all:    (chartType: ChartType) => [chartType] as const,
  lists:  (chartType: ChartType) => [...accountabilityKeys.all(chartType), "list"] as const,
  list:   (chartType: ChartType, filters: Record<string, unknown>) =>
            [...accountabilityKeys.lists(chartType), filters] as const,
  detail: (chartType: ChartType, id: string) =>
            [...accountabilityKeys.all(chartType), "detail", id] as const,
};

const BASE = (chartType: ChartType) => `/api/${chartType}`;

export function useAccountabilityFunctions(chartType: ChartType) {
  return useQuery({
    queryKey: accountabilityKeys.list(chartType, {}),
    queryFn:  () => fetchJSON(`${BASE(chartType)}`),
    staleTime: 1000 * 60 * 5,
  });
}

export function useCreateAccountabilityFunction(chartType: ChartType) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: unknown) =>
      fetchJSON(BASE(chartType), {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: accountabilityKeys.lists(chartType) }),
  });
}

export function useUpdateAccountabilityFunction(chartType: ChartType, id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: unknown) =>
      fetchJSON(`${BASE(chartType)}/${id}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountabilityKeys.detail(chartType, id) });
      qc.invalidateQueries({ queryKey: accountabilityKeys.lists(chartType) });
    },
  });
}

export function useDeleteAccountabilityFunction(chartType: ChartType) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetchJSON(`${BASE(chartType)}/${id}`, { method: "DELETE" }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: accountabilityKeys.lists(chartType) }),
  });
}

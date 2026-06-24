"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const BASE = "/api/performance";

async function fetchJSON(url: string) {
  const res = await fetch(url);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export interface PageMeta { page: number; limit: number; total: number; totalPages: number; }
export interface Paginated<T> { data: T[]; meta: PageMeta; }

async function fetchPaginated<T>(url: string): Promise<Paginated<T>> {
  const res = await fetch(url);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return { data: json.data ?? [], meta: json.meta };
}

export interface PageParams { page: number; limit: number; search?: string; }

function toQuery(params: PageParams): string {
  const qs = new URLSearchParams({ page: String(params.page), limit: String(params.limit) });
  if (params.search) qs.set("search", params.search);
  return qs.toString();
}

export function useScorecard() {
  return useQuery({ queryKey: ["performance", "scorecard"], queryFn: () => fetchJSON(`${BASE}/scorecard`), staleTime: 1000 * 60 * 5 });
}

export function useIndividualPerformance(params: PageParams) {
  return useQuery({
    queryKey: ["performance", "individual", params],
    queryFn: () => fetchPaginated<any>(`${BASE}/individual?${toQuery(params)}`),
    staleTime: 1000 * 60 * 5,
    placeholderData: (prev) => prev,
  });
}

export function useUserPerformance(userId: string) {
  return useQuery({ queryKey: ["performance", "individual", userId], queryFn: () => fetchJSON(`${BASE}/individual/${userId}`), enabled: !!userId, staleTime: 1000 * 60 * 5 });
}

export function useTeamPerformance(params: PageParams) {
  return useQuery({
    queryKey: ["performance", "teams", params],
    queryFn: () => fetchPaginated<any>(`${BASE}/teams?${toQuery(params)}`),
    staleTime: 1000 * 60 * 5,
    placeholderData: (prev) => prev,
  });
}

export function usePerformanceTrends() {
  return useQuery({ queryKey: ["performance", "trends"], queryFn: () => fetchJSON(`${BASE}/trends`), staleTime: 1000 * 60 * 5 });
}

export function usePerformanceReviews() {
  return useQuery({ queryKey: ["performance", "reviews"], queryFn: () => fetchJSON(`${BASE}/reviews`), staleTime: 1000 * 60 * 5 });
}

export function useCreateReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => fetch(`${BASE}/reviews`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["performance", "reviews"] })
  });
}

export function useUpdateReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: any) => fetch(`${BASE}/reviews/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["performance", "reviews"] })
  });
}

export function useTalent() {
  return useQuery({
    queryKey: ["performance", "talent"],
    queryFn: () => fetchJSON(`${BASE}/talent`),
    staleTime: 1000 * 60 * 5,
  });
}

export function useUpsertTalent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      fetch(`${BASE}/talent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["performance", "talent"] }),
  });
}

export interface TalentBenchmark { perfCut: number; potentialCut: number; isDefault: boolean; updatedAt: string | null; }

export function useTalentBenchmark() {
  return useQuery<TalentBenchmark>({
    queryKey: ["performance", "talent", "benchmark"],
    queryFn: () => fetchJSON(`${BASE}/talent/benchmark`),
    staleTime: 1000 * 60 * 5,
  });
}

export function useUpdateTalentBenchmark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { perfCut: number; potentialCut: number }) =>
      fetch(`${BASE}/talent/benchmark`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["performance", "talent", "benchmark"] });
      qc.invalidateQueries({ queryKey: ["performance", "talent"] }); // re-fetch so quadrants re-sort
    },
  });
}

/* ── R10b: Cycle Hub ───────────────────────────────────────────────────── */

export function useCycle() {
  return useQuery({
    queryKey: ["performance", "cycle"],
    queryFn: () => fetchJSON(`${BASE}/cycle`),
    staleTime: 1000 * 60 * 5,
  });
}

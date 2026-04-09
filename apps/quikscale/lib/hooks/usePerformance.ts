"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const BASE = "/api/performance";

async function fetchJSON(url: string) {
  const res = await fetch(url);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

export function useScorecard() {
  return useQuery({ queryKey: ["performance", "scorecard"], queryFn: () => fetchJSON(`${BASE}/scorecard`), staleTime: 1000 * 60 * 5 });
}

export function useIndividualPerformance() {
  return useQuery({ queryKey: ["performance", "individual"], queryFn: () => fetchJSON(`${BASE}/individual`), staleTime: 1000 * 60 * 5 });
}

export function useUserPerformance(userId: string) {
  return useQuery({ queryKey: ["performance", "individual", userId], queryFn: () => fetchJSON(`${BASE}/individual/${userId}`), enabled: !!userId, staleTime: 1000 * 60 * 5 });
}

export function useTeamPerformance() {
  return useQuery({ queryKey: ["performance", "teams"], queryFn: () => fetchJSON(`${BASE}/teams`), staleTime: 1000 * 60 * 5 });
}

export function usePerformanceTrends() {
  return useQuery({ queryKey: ["performance", "trends"], queryFn: () => fetchJSON(`${BASE}/trends`), staleTime: 1000 * 60 * 5 });
}

export function usePerformanceReviews() {
  return useQuery({ queryKey: ["performance", "reviews"], queryFn: () => fetchJSON(`${BASE}/reviews`), staleTime: 1000 * 60 * 2 });
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

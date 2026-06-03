"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  LaunchCampaignInput,
  UpdateCampaignInput,
  SubmitResponseInput,
} from "@/lib/schemas/habitSchema";

const BASE = "/api/habits";

async function fetchEnvelope<T = unknown>(
  url: string,
  init?: RequestInit,
): Promise<{ data: T; role?: "admin" | "member" }> {
  const res = await fetch(url, init);
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? "Request failed");
  return { data: json.data as T, role: json.role };
}

async function fetchData<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  return (await fetchEnvelope<T>(url, init)).data;
}

export const habitKeys = {
  all: ["habits"] as const,
  list: (filters: Record<string, unknown>) => [...habitKeys.all, "list", filters] as const,
  detail: (id: string) => [...habitKeys.all, "detail", id] as const,
  myResponse: (id: string) => [...habitKeys.all, "my-response", id] as const,
  participation: (id: string) => [...habitKeys.all, "participation", id] as const,
  trends: () => [...habitKeys.all, "trends"] as const,
};

export interface TrendPoint {
  id: string;
  quarter: string;
  year: number;
  round: number;
  totalRounds: number;
  status: "active" | "closed";
  overallPct: number;
  respondentCount: number;
  label: string;
  completedAt: string;
}

export function useHabitTrends() {
  return useQuery({
    queryKey: habitKeys.trends(),
    queryFn: () => fetchData<TrendPoint[]>(`${BASE}/trends`),
    staleTime: 1000 * 60,
  });
}

/**
 * Role-aware list query.
 *
 *  - Admin: returns the full array of campaigns (drafts + active + closed + legacy).
 *  - Member: returns `null` (no active campaign) OR a single campaign object
 *            shaped `{ id, quarter, year, status, deadline, hasSubmitted, submittedAt }`.
 *
 * The caller is expected to inspect the `role` field on the envelope (exposed
 * via `useHabitsEnvelope`) when it needs to branch UI; for most call sites the
 * shape of `data` is enough.
 */
export function useHabits(filters: { year?: number; quarter?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.year) params.set("year", String(filters.year));
  if (filters.quarter) params.set("quarter", filters.quarter);
  const qs = params.toString();
  return useQuery({
    queryKey: habitKeys.list(filters),
    queryFn: () => fetchEnvelope<unknown>(`${BASE}${qs ? `?${qs}` : ""}`),
    // The response *shape* depends on the caller's role (admin → array,
    // member → single object). When perms change mid-session the same cache
    // key would otherwise serve the wrong shape to the new view, so we
    // always refetch on mount and never serve a stale value as fresh.
    staleTime: 0,
    refetchOnMount: "always",
  });
}

export interface ParticipationMember {
  id: string;
  name: string;
  email: string;
  role?: string;
  hasSubmitted: boolean;
  submittedAt: string | null;
}

export interface ParticipationSummary {
  total: number;
  submitted: number;
  pending: number;
  members: ParticipationMember[];
}

/** Admin-only — who has and hasn't submitted (no answers exposed). */
export function useHabitParticipation(id: string) {
  return useQuery({
    queryKey: habitKeys.participation(id),
    queryFn: () => fetchData<ParticipationSummary>(`${BASE}/${id}/participation`),
    enabled: !!id,
    staleTime: 1000 * 30,
  });
}

/** Admin-only — aggregated campaign view. Members get 403. */
export function useHabitCampaign(id: string) {
  return useQuery({
    queryKey: habitKeys.detail(id),
    queryFn: () => fetchData(`${BASE}/${id}`),
    enabled: !!id,
  });
}

/** Member — fetch own response (404 if not yet submitted). */
export function useMyHabitResponse(id: string, enabled = true) {
  return useQuery({
    queryKey: habitKeys.myResponse(id),
    queryFn: async () => {
      try {
        return await fetchData(`${BASE}/${id}/my-response`);
      } catch (e: unknown) {
        if (e instanceof Error && /No response yet/i.test(e.message)) return null;
        throw e;
      }
    },
    enabled: enabled && !!id,
    staleTime: 1000 * 60,
  });
}

export function useSubmitMyResponse(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SubmitResponseInput) =>
      fetchData(`${BASE}/${id}/my-response`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: habitKeys.myResponse(id) });
      qc.invalidateQueries({ queryKey: habitKeys.participation(id) });
      qc.invalidateQueries({ queryKey: habitKeys.all });
    },
  });
}

export function useCreateHabitCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LaunchCampaignInput) =>
      fetchData(BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: habitKeys.all }),
  });
}

export function useUpdateHabitCampaign(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateCampaignInput) =>
      fetchData(`${BASE}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: habitKeys.detail(id) });
      qc.invalidateQueries({ queryKey: habitKeys.trends() });
      qc.invalidateQueries({ queryKey: habitKeys.all });
    },
  });
}

export function useLaunchHabitCampaign(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => fetchData(`${BASE}/${id}/launch`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: habitKeys.detail(id) });
      qc.invalidateQueries({ queryKey: habitKeys.trends() });
      qc.invalidateQueries({ queryKey: habitKeys.all });
    },
  });
}

export function useCloseHabitCampaign(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => fetchData(`${BASE}/${id}/close`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: habitKeys.detail(id) });
      qc.invalidateQueries({ queryKey: habitKeys.trends() });
      qc.invalidateQueries({ queryKey: habitKeys.all });
    },
  });
}

export function useDeleteHabitCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetchData(`${BASE}/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: habitKeys.all }),
  });
}

// Legacy aliases kept for callers we haven't migrated yet — these will be
// removed once the old AssessmentModal flow is fully retired.
export const useHabitAssessment = useHabitCampaign;
export const useCreateHabitAssessment = useCreateHabitCampaign;
export const useUpdateHabitAssessment = useUpdateHabitCampaign;
export const useDeleteHabitAssessment = useDeleteHabitCampaign;

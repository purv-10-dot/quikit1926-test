"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { PriorityRow } from "@/lib/types/priority";

// ── Query Keys ────────────────────────────────────────────────────────────────

const priorityKeys = {
  all: ["priority"] as const,
  lists: () => [...priorityKeys.all, "list"] as const,
  list: (year: number, quarter: string) => [...priorityKeys.lists(), { year, quarter }] as const,
  details: () => [...priorityKeys.all, "detail"] as const,
  detail: (id: string) => [...priorityKeys.details(), id] as const,
};

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchPriorities(year: number, quarter: string): Promise<PriorityRow[]> {
  const res = await fetch(`/api/priority?year=${year}&quarter=${encodeURIComponent(quarter)}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to fetch priorities");
  return data.data;
}

async function createPriority(body: Partial<PriorityRow>): Promise<PriorityRow> {
  const res = await fetch("/api/priority", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to create priority");
  return data.data;
}

async function updatePriority(id: string, body: Partial<PriorityRow>): Promise<PriorityRow> {
  const res = await fetch(`/api/priority/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to update priority");
  return data.data;
}

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

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function usePriorities(year: number, quarter: string) {
  return useQuery({
    queryKey: priorityKeys.list(year, quarter),
    queryFn: () => fetchPriorities(year, quarter),
    staleTime: 1000 * 60 * 5,
  });
}

export function useCreatePriority() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<PriorityRow>) => createPriority(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: priorityKeys.lists() });
    },
  });
}

export function useUpdatePriority(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<PriorityRow>) => updatePriority(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: priorityKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: priorityKeys.lists() });
    },
  });
}

export function useUpdateWeeklyStatus(priorityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { weekNumber: number; status: string; notes?: string }) =>
      updateWeeklyStatus(priorityId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: priorityKeys.detail(priorityId) });
      queryClient.invalidateQueries({ queryKey: priorityKeys.lists() });
    },
  });
}

export function useDeletePriority() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/priority/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to delete priority");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: priorityKeys.lists() });
    },
  });
}

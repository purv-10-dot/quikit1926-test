"use client";

/**
 * React Query hooks for the generic Meeting + MeetingTemplate models.
 *
 * Covers the 4 non-Daily cadences (weekly/monthly/quarterly/annual) via the
 * Meeting table. The Daily Huddle keeps its own dedicated hook / API route.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Cadence } from "@/lib/schemas/meetingSchema";

const BASE = "/api/meetings";

async function fetchJSON<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? "Request failed");
  return json.data as T;
}

/* ── Query keys ───────────────────────────────────────────────────────────── */

export const meetingKeys = {
  all: ["meetings"] as const,
  lists: () => [...meetingKeys.all, "list"] as const,
  list: (filters: { cadence?: Cadence; from?: string; to?: string }) =>
    [...meetingKeys.lists(), filters] as const,
  detail: (id: string) => [...meetingKeys.all, "detail", id] as const,
  templates: () => [...meetingKeys.all, "templates"] as const,
};

/* ── Meetings ─────────────────────────────────────────────────────────────── */

export function useMeetings(filters: {
  cadence?: Cadence;
  from?: string;
  to?: string;
} = {}) {
  const params = new URLSearchParams();
  if (filters.cadence) params.set("cadence", filters.cadence);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  const qs = params.toString();

  return useQuery({
    queryKey: meetingKeys.list(filters),
    queryFn: () => fetchJSON(`${BASE}${qs ? `?${qs}` : ""}`),
    staleTime: 1000 * 60 * 5,
  });
}

export function useMeeting(id: string) {
  return useQuery({
    queryKey: meetingKeys.detail(id),
    queryFn: () => fetchJSON(`${BASE}/${id}`),
    enabled: !!id,
    staleTime: 1000 * 60 * 5,
  });
}

export function useCreateMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: unknown) =>
      fetchJSON(BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: meetingKeys.lists() }),
  });
}

export function useUpdateMeeting(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: unknown) =>
      fetchJSON(`${BASE}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: meetingKeys.detail(id) });
      qc.invalidateQueries({ queryKey: meetingKeys.lists() });
    },
  });
}

export function useDeleteMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetchJSON(`${BASE}/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: meetingKeys.lists() }),
  });
}

/* ── Templates ────────────────────────────────────────────────────────────── */

export function useMeetingTemplates() {
  return useQuery({
    queryKey: meetingKeys.templates(),
    queryFn: () => fetchJSON(`${BASE}/templates`),
    staleTime: 1000 * 60 * 10,
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: unknown) =>
      fetchJSON(`${BASE}/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: meetingKeys.templates() }),
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Record<string, unknown>) =>
      fetchJSON(`${BASE}/templates/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: meetingKeys.templates() }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetchJSON(`${BASE}/templates/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: meetingKeys.templates() }),
  });
}

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { WWWItem } from "@/lib/types/www";

// ── Query Keys ────────────────────────────────────────────────────────────────

const wwwKeys = {
  all: ["www"] as const,
  lists: () => [...wwwKeys.all, "list"] as const,
  list: (filters: { search?: string; status?: string }) =>
    [...wwwKeys.lists(), filters] as const,
};

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchWWWItems(filters: { search?: string; status?: string }): Promise<WWWItem[]> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  const qs = params.toString();
  const res = await fetch(`/api/www${qs ? `?${qs}` : ""}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to fetch WWW items");
  return data.data;
}

async function createWWWItem(body: Partial<WWWItem>): Promise<WWWItem> {
  const res = await fetch("/api/www", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to create WWW item");
  return data.data;
}

async function updateWWWItem(id: string, body: Partial<WWWItem>): Promise<WWWItem> {
  const res = await fetch(`/api/www/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to update WWW item");
  return data.data;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useWWWItems(filters: { search?: string; status?: string }) {
  return useQuery({
    queryKey: wwwKeys.list(filters),
    queryFn: () => fetchWWWItems(filters),
    staleTime: 1000 * 60 * 5,
  });
}

export function useCreateWWW() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<WWWItem>) => createWWWItem(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wwwKeys.lists() });
    },
  });
}

export function useUpdateWWW(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<WWWItem>) => updateWWWItem(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wwwKeys.lists() });
    },
  });
}

export function useDeleteWWW() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/www/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to delete WWW item");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: wwwKeys.lists() });
    },
  });
}

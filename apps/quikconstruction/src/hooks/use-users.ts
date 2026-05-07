"use client";

/**
 * React Query hooks for user accounts (settings/users).
 *
 * Mirrors the use-masters pattern exactly so User Management plugs into
 * MasterListPage + FormDrawer the same way every master does.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const BASE = "/api/settings/users";
const KEY = "settings-users";

async function fetchApi<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function mutateApi<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Request failed");
  }
  return res.json();
}

export function useUsers(params?: { search?: string }) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  const query = qs.toString();
  return useQuery({
    queryKey: [KEY, query],
    queryFn: () =>
      fetchApi<{ data: any[]; total: number }>(`${BASE}${query ? `?${query}` : ""}`),
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => mutateApi(BASE, "POST", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: any) => mutateApi(`${BASE}/${id}`, "PUT", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mutateApi(`${BASE}/${id}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

"use client";

/**
 * React Query hooks for user accounts (settings/users).
 *
 * Mirrors the use-masters pattern exactly so User Management plugs into
 * MasterListPage + FormDrawer the same way every master does.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJson, mutateJson } from "@/lib/react-query/fetch-json";
import { refreshListQueries } from "@/lib/react-query/list-cache";
import { entityMeta } from "@/lib/toast";

const BASE = "/api/settings/users";
const KEY = "settings-users";

const fetchApi = fetchJson;
const mutateApi = mutateJson;

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
    onSuccess: async () => { await refreshListQueries(qc, KEY); },
    meta: entityMeta("create", "User"),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: any) => mutateApi(`${BASE}/${id}`, "PUT", data),
    onSuccess: async (data, { id }) => {
      await refreshListQueries(qc, KEY, { updatedRow: data, id });
    },
    meta: entityMeta("update", "User"),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mutateApi(`${BASE}/${id}`, "DELETE"),
    onSuccess: async (_data, id) => {
      await refreshListQueries(qc, KEY, { removedId: id });
    },
    meta: entityMeta("delete", "User"),
  });
}

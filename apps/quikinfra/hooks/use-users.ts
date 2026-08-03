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
import type { CentralUserRecord } from "@/lib/users/central-repository";

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
      fetchApi<{ data: CentralUserRecord[]; total: number }>(`${BASE}${query ? `?${query}` : ""}`),
  });
}

/**
 * Org-wide id → display-name map for audit columns (Created By / Updated By).
 * Separate from {@link useUsers} because that endpoint requires user-management
 * permission; this one only requires being signed in, so the columns resolve
 * for every role. Cached for the session — names change rarely.
 */
export function useUserNames() {
  return useQuery({
    queryKey: ["org-user-names"],
    queryFn: () =>
      fetchApi<{ data: Array<{ id: string; name: string }> }>(
        "/api/org/user-names",
      ),
    staleTime: Infinity,
  });
}

export interface OrgRole {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isDefault: boolean;
  memberCount: number;
  permissionCount: number;
  createdAt: string;
}

export function useRoles() {
  return useQuery({
    queryKey: ["org-roles"],
    queryFn: () =>
      fetchApi<{ success: boolean; data: OrgRole[] }>("/api/org/roles"),
    // The role catalog is org-level and changes only when an admin
    // adds/edits/deletes a role in Settings → Roles. Cache it for the whole
    // session so it's fetched ONCE and reused across navigations instead of
    // re-hitting /api/org/roles on every page mount + window focus. The
    // Settings → Roles page invalidates ["org-roles"] after a mutation, so
    // the dropdown still refreshes when the catalog actually changes.
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => mutateApi(BASE, "POST", data),
    onSuccess: async () => { await refreshListQueries(qc, KEY); },
    meta: entityMeta("create", "User"),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) => mutateApi(`${BASE}/${id}`, "PUT", data),
    onSuccess: async (data, { id }) => {
      await refreshListQueries(qc, KEY, { updatedRow: data, id });
      // Also refresh the per-user permission view and the current user's own
      // effective permissions. Editing modules/role here changes the derived
      // permission matrix; without these the Permissions page (["settings-user", id])
      // and the sidebar/route gates (["me"]) keep serving stale grants until a
      // hard refresh — e.g. an unticked module still shows fully granted.
      await qc.invalidateQueries({ queryKey: ["settings-user", id] });
      await qc.invalidateQueries({ queryKey: ["me"] });
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

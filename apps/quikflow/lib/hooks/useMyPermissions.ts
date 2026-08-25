"use client";

/**
 * Client-side permission gate hook.
 *
 * Fetches the current user's effective permission set from
 * `/api/me/permissions` once per mount and exposes a `.has()` helper.
 *
 * SIDE EFFECT — this is QuikFlow's seed-bootstrap trigger. Mounted in
 * `DashboardShell` (rendered on every dashboard page), so the first time
 * anyone opens QuikFlow for an org, `GET /api/me/permissions` fires and its
 * server-side handler calls `seedAllDefaultRoles(orgId)` — creating the
 * org's "admin" and "Member" `AppRole` rows. Without this hook mounted
 * somewhere always-on, nothing ever seeds QuikFlow's roles for a fresh org
 * (mirrors apps/quikscale/lib/hooks/useMyPermissions.ts, which is mounted
 * in its sidebar for the same reason).
 *
 * Cached via React Query so multiple components hitting `useMyPermissions()`
 * share one fetch. The cache stays for 5 minutes — short enough that
 * permission changes from another tab/admin propagate without manual
 * invalidation, long enough that navigating between pages doesn't refetch.
 */

import { useQuery } from "@tanstack/react-query";

interface MyPermissionsResponse {
  success: boolean;
  data: {
    isAdmin: boolean;
    roleId: string | null;
    roleName: string | null;
    permissions: string[]; // `resource:action`
  };
}

const EMPTY: MyPermissionsResponse["data"] = {
  isAdmin: false,
  roleId: null,
  roleName: null,
  permissions: [],
};

async function fetchMyPermissions(): Promise<MyPermissionsResponse["data"]> {
  const res = await fetch("/api/me/permissions");
  if (!res.ok) return EMPTY; // unauth or no membership — treat as zero perms
  const json: MyPermissionsResponse = await res.json();
  return json.success ? json.data : EMPTY;
}

export interface MyPermissionsApi {
  isAdmin: boolean;
  roleName: string | null;
  /** True when the (resource, action) pair is granted via the user's role. */
  has(resource: string, action: string): boolean;
  /** Raw list in case a caller needs it. */
  permissions: string[];
  /** Set to true while the initial fetch is in flight. */
  loading: boolean;
}

export function useMyPermissions(): MyPermissionsApi {
  const { data, isLoading } = useQuery({
    queryKey: ["quikflow", "me-permissions"],
    queryFn: fetchMyPermissions,
    staleTime: 5 * 60 * 1000,
  });

  const permSet = new Set(data?.permissions ?? []);

  return {
    isAdmin: !!data?.isAdmin,
    roleName: data?.roleName ?? null,
    has: (resource: string, action: string) => permSet.has(`${resource}:${action}`),
    permissions: data?.permissions ?? [],
    loading: isLoading,
  };
}

"use client";

/**
 * Client-side permission gate hook.
 *
 * Fetches the current user's effective permission set from
 * `/api/me/permissions` once per mount and exposes a `.has()` helper.
 *
 * The returned set is the UNION of role-granted permissions and user-level
 * extras — same logic as the server-side `userCan()` check.
 *
 * Sidebar visibility is derived from `view` grants via the `NAV_RESOURCE`
 * map in `lib/api/permissionsRegistry.ts` — there is no separate nav set.
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
    extras: string[];
  };
}

async function fetchMyPermissions(): Promise<MyPermissionsResponse["data"]> {
  const res = await fetch("/api/me/permissions");
  if (!res.ok) {
    // Unauth or no membership — treat as zero perms.
    return {
      isAdmin: false,
      roleId: null,
      roleName: null,
      permissions: [],
      extras: [],
    };
  }
  const json: MyPermissionsResponse = await res.json();
  if (!json.success) {
    return {
      isAdmin: false,
      roleId: null,
      roleName: null,
      permissions: [],
      extras: [],
    };
  }
  return json.data;
}

export interface MyPermissionsApi {
  isAdmin: boolean;
  roleName: string | null;
  /** True when the (resource, action) pair is granted (role or extra). */
  has(resource: string, action: string): boolean;
  /** Raw lists in case a caller needs them. */
  permissions: string[];
  extras: string[];
  /** Set to true while the initial fetch is in flight. */
  loading: boolean;
}

export function useMyPermissions(): MyPermissionsApi {
  const { data, isLoading } = useQuery({
    queryKey: ["me-permissions"],
    queryFn: fetchMyPermissions,
    staleTime: 5 * 60 * 1000,
  });

  const permSet = new Set(data?.permissions ?? []);

  return {
    isAdmin: !!data?.isAdmin,
    roleName: data?.roleName ?? null,
    has: (resource: string, action: string) => permSet.has(`${resource}:${action}`),
    permissions: data?.permissions ?? [],
    extras: data?.extras ?? [],
    loading: isLoading,
  };
}

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
    navigation: string[];
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
      navigation: [],
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
      navigation: [],
    };
  }
  return json.data;
}

export interface MyPermissionsApi {
  isAdmin: boolean;
  roleName: string | null;
  /** True when the (resource, action) pair is granted (role or extra). */
  has(resource: string, action: string): boolean;
  /** True when the navKey appears in the role's nav whitelist. */
  hasNav(navKey: string): boolean;
  /** Raw lists in case a caller needs them. */
  permissions: string[];
  extras: string[];
  navigation: string[];
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
  const navSet = new Set(data?.navigation ?? []);

  return {
    isAdmin: !!data?.isAdmin,
    roleName: data?.roleName ?? null,
    has: (resource: string, action: string) => permSet.has(`${resource}:${action}`),
    hasNav: (navKey: string) => navSet.has(navKey),
    permissions: data?.permissions ?? [],
    extras: data?.extras ?? [],
    navigation: data?.navigation ?? [],
    loading: isLoading,
  };
}

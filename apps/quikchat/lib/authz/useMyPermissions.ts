"use client";

/**
 * Client-side permission gate hook (RBAC v2, Phase 2).
 *
 * Fetches the caller's effective permission set from `/api/me/permissions`
 * once per mount and exposes a `.has(resource, action)` helper. The set is the
 * UNION of role grants + user extras — same logic as the server `userCan()`.
 *
 * ⚠️ UI hiding is UX only. The SERVER gates (userCan in routes/services) are
 * the enforcement; this just avoids showing affordances a click would 403.
 *
 * Mirrors apps/quikscale/lib/hooks/useMyPermissions.ts, adapted to QuikChat's
 * bare response body (no `{ success, data }` envelope). Cached via React Query
 * (5-min staleTime) so every component shares one fetch.
 */

import { useQuery } from "@tanstack/react-query";

export interface MyPermissions {
  isAdmin: boolean;
  roleId: string | null;
  roleName: string | null;
  permissions: string[]; // `resource:action`
  extras: string[];
}

const EMPTY: MyPermissions = {
  isAdmin: false,
  roleId: null,
  roleName: null,
  permissions: [],
  extras: [],
};

async function fetchMyPermissions(): Promise<MyPermissions> {
  try {
    const res = await fetch("/api/me/permissions");
    if (!res.ok) return EMPTY; // unauth / no membership → zero perms
    return (await res.json()) as MyPermissions;
  } catch {
    return EMPTY;
  }
}

export interface MyPermissionsApi {
  isAdmin: boolean;
  roleName: string | null;
  /** True when the (resource, action) pair is granted (role or extra). */
  has(resource: string, action: string): boolean;
  permissions: string[];
  extras: string[];
  /** True while the initial fetch is in flight. */
  loading: boolean;
}

export function useMyPermissions(): MyPermissionsApi {
  const { data, isLoading } = useQuery({
    queryKey: ["me-permissions"],
    queryFn: fetchMyPermissions,
    staleTime: 5 * 60 * 1000,
    retry: false,
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

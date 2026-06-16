"use client";

/**
 * Client-side permission gate hook for QuikTrack.
 *
 * Fetches `/api/me/permissions` once and exposes `.has(resource, action)` +
 * `.hasNav(navKey)`. Cached via React Query (5-min staleTime) so multiple
 * components sharing this hook produce one network call.
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

const EMPTY: MyPermissionsResponse["data"] = {
  isAdmin: false,
  roleId: null,
  roleName: null,
  permissions: [],
  extras: [],
  navigation: [],
};

async function fetchMyPermissions(): Promise<MyPermissionsResponse["data"]> {
  const res = await fetch("/api/me/permissions");
  if (!res.ok) return EMPTY;
  const json: MyPermissionsResponse = await res.json();
  if (!json.success) return EMPTY;
  return json.data;
}

export interface MyPermissionsApi {
  isAdmin: boolean;
  roleName: string | null;
  has(resource: string, action: string): boolean;
  hasNav(navKey: string): boolean;
  permissions: string[];
  extras: string[];
  navigation: string[];
  loading: boolean;
}

export function useMyPermissions(): MyPermissionsApi {
  const { data, isLoading } = useQuery({
    queryKey: ["quiktrack", "me-permissions"],
    queryFn: fetchMyPermissions,
    staleTime: 5 * 60 * 1000,
  });

  const permSet = new Set(data?.permissions ?? []);
  const navSet = new Set(data?.navigation ?? []);

  return {
    isAdmin: !!data?.isAdmin,
    roleName: data?.roleName ?? null,
    has: (resource, action) => permSet.has(`${resource}:${action}`),
    hasNav: (navKey) => navSet.has(navKey),
    permissions: data?.permissions ?? [],
    extras: data?.extras ?? [],
    navigation: data?.navigation ?? [],
    loading: isLoading,
  };
}

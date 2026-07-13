"use client";

/**
 * QuikInfra — client-side permission hook.
 *
 * Wraps GET /api/me/permissions in TanStack Query. Returns:
 *   has(resource, action)  — pure lookup, never re-fetches
 *   isAdmin                — user holds the system "admin" role
 *   roleName               — primary role display name
 *   isLoading / error      — standard TanStack flags
 *
 * Security note: client-side checks are UX only — gate every mutation
 * server-side via userCan() or requireAdmin(). A tampered cache cannot
 * bypass server enforcement.
 *
 * Mirrors apps/quikscale/lib/hooks/useMyPermissions.ts.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

interface MyPermissionsPayload {
  isAdmin: boolean;
  roleId: string | null;
  roleName: string | null;
  permissions: string[]; // "resource:action" strings
  extras: string[];
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function fetchMyPermissions(): Promise<MyPermissionsPayload> {
  const res = await fetch("/api/me/permissions", { credentials: "include" });
  if (!res.ok) {
    throw new Error(`Failed to load permissions: ${res.status}`);
  }
  const body = (await res.json()) as ApiEnvelope<MyPermissionsPayload>;
  if (!body.success || !body.data) {
    throw new Error(body.error ?? "Unknown error loading permissions");
  }
  return body.data;
}

export interface UseMyPermissionsResult {
  has: (resource: string, action: string) => boolean;
  isAdmin: boolean;
  roleId: string | null;
  roleName: string | null;
  permissions: string[];
  extras: string[];
  isLoading: boolean;
  error: Error | null;
}

export function useMyPermissions(): UseMyPermissionsResult {
  const query = useQuery<MyPermissionsPayload, Error>({
    queryKey: ["me", "permissions"],
    queryFn: fetchMyPermissions,
    staleTime: 30 * 1000, // 30s — fresh enough for snappy UX, slow enough not to spam
    refetchOnWindowFocus: false,
  });

  const permissionSet = useMemo(() => {
    return new Set(query.data?.permissions ?? []);
  }, [query.data?.permissions]);

  const has = useMemo(
    () => (resource: string, action: string) => {
      // Fail-open while loading — better to flash an extra button than to
      // hide everything. The server still 403s if the user isn't allowed.
      if (query.isLoading) return true;
      return permissionSet.has(`${resource}:${action}`);
    },
    [permissionSet, query.isLoading],
  );

  return {
    has,
    isAdmin: query.data?.isAdmin ?? false,
    roleId: query.data?.roleId ?? null,
    roleName: query.data?.roleName ?? null,
    permissions: query.data?.permissions ?? [],
    extras: query.data?.extras ?? [],
    isLoading: query.isLoading,
    error: query.error ?? null,
  };
}

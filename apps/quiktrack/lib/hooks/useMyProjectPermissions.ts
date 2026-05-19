"use client";

/**
 * Client-side project-scoped permission gate. Returns Layer 1 ∪ Layer 2 for
 * the given projectId, so UI components inside `/spaces/[id]/*` can gate
 * mutation buttons exactly the way the server's `userCanInProject` would.
 *
 * Pairs with the app-wide `useMyPermissions()` — use this one when you're
 * rendering inside a project's UI, the global hook everywhere else.
 */
import { useQuery } from "@tanstack/react-query";
import { useMyPermissions } from "./useMyPermissions";

interface Response {
  success: boolean;
  data: { projectId: string; permissions: string[] };
}

async function fetchProjectPerms(projectId: string): Promise<string[]> {
  const r = await fetch(
    `/api/me/project-permissions?projectId=${encodeURIComponent(projectId)}`,
  );
  if (!r.ok) return [];
  const j: Response = await r.json();
  return j.success ? j.data.permissions : [];
}

export interface MyProjectPermissionsApi {
  isAdmin: boolean;
  has(resource: string, action: string): boolean;
  loading: boolean;
}

export function useMyProjectPermissions(
  projectId: string | undefined | null,
): MyProjectPermissionsApi {
  const global = useMyPermissions();

  const { data, isLoading } = useQuery({
    queryKey: ["quiktrack", "me-project-permissions", projectId],
    queryFn: () => fetchProjectPerms(projectId!),
    enabled: !!projectId && !global.isAdmin,
    staleTime: 5 * 60 * 1000,
  });

  // Tenant admins bypass — short-circuit.
  if (global.isAdmin) {
    return { isAdmin: true, has: () => true, loading: false };
  }

  const set = new Set(data ?? []);
  return {
    isAdmin: false,
    has: (resource, action) =>
      set.has(`${resource}:${action}`) || global.has(resource, action),
    loading: isLoading || global.loading,
  };
}

"use client";

/**
 * Per-resource permission gate for client-side UI.
 *
 * Wraps `useMyPermissions()` and returns canCreate / canUpdate / canDelete
 * for a single resource. Admin users short-circuit to true (matches the
 * sidebar's admin-bypass) — the server still enforces every request.
 *
 * Usage:
 *   const { canCreate, canUpdate, canDelete } = useResourcePermissions("KPI");
 *   {canCreate && <AddButton>Add KPI</AddButton>}
 */

import { useMyPermissions } from "@/lib/hooks/useMyPermissions";

export interface ResourcePermissions {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  loading: boolean;
}

export function useResourcePermissions(resource: string): ResourcePermissions {
  const perms = useMyPermissions();
  return {
    canCreate: perms.isAdmin || perms.has(resource, "create"),
    canUpdate: perms.isAdmin || perms.has(resource, "update"),
    canDelete: perms.isAdmin || perms.has(resource, "delete"),
    loading: perms.loading,
  };
}

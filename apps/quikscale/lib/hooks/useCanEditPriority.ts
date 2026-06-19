"use client";

import { useMyPermissions } from "@/lib/hooks/useMyPermissions";

/**
 * Client-side permission check for editing a Priority row.
 *
 * Delegates to the RBAC v2 dynamic permission set
 * (`useMyPermissions().has("Priority", "update")`) which mirrors the
 * server-side `userCan` gate enforced by `auth.update` on the route handler.
 *
 * The legacy creator/assignee/admin-tier check was retired — Priority access
 * is now governed solely by the role-permission matrix configured under
 * Org Setup → Users → User Management.
 *
 * The `priority` argument is kept for call-site compatibility but is unused.
 */
export function useCanEditPriority(
  _priority?: { createdBy?: string; owner?: string } | null,
): boolean {
  const { has, loading } = useMyPermissions();
  if (loading) return false;
  return has("Priority", "update");
}

"use client";

import { useMyPermissions } from "@/lib/hooks/useMyPermissions";

/**
 * Client-side permission check for managing a team's KPIs.
 *
 * Delegates to the RBAC v2 dynamic permission set — granted when the user
 * has BOTH `TeamKPI:create` (to add) AND `TeamKPI:update` (to edit/delete)
 * grants. Authoritative server-side gating is handled by `auth.create` /
 * `auth.update` on the team KPI route handlers.
 *
 * The legacy "team head or admin tier" check was retired — team KPI access
 * is now governed solely by the role-permission matrix.
 *
 * The `teamId` argument is kept for call-site compatibility but is unused.
 */
export function useCanManageTeamKPI(_teamId?: string | null): boolean {
  const { has, loading } = useMyPermissions();
  if (loading) return false;
  // "Manage" in the UI sense means the user can add/edit/delete team KPIs.
  return has("TeamKPI", "create") || has("TeamKPI", "update");
}

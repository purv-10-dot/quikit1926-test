"use client";

import { useMyPermissions } from "@/lib/hooks/useMyPermissions";

type KPIForPermission = {
  kpiLevel?: string | null;
  createdBy?: string;
  owner?: string | null;
  ownerIds?: string[] | null;
  team?: { headId?: string | null } | null;
};

/**
 * Client-side permission check for editing a KPI row.
 *
 * Delegates to the RBAC v2 dynamic permission set:
 *   - Individual KPI → `KPI:update`
 *   - Team KPI       → `TeamKPI:update`
 *
 * Mirrors the server-side `auth.update` gate. The legacy
 * creator/assignee/team-head/admin-tier check was retired — KPI access is
 * now governed solely by the role-permission matrix.
 */
export function useCanEditKPI(kpi: KPIForPermission | null | undefined): boolean {
  const { has, loading } = useMyPermissions();
  if (!kpi || loading) return false;
  const resource = kpi.kpiLevel === "team" ? "TeamKPI" : "KPI";
  return has(resource, "update");
}

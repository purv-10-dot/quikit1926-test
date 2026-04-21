"use client";

import { useSession } from "next-auth/react";
import { ROLES, ROLE_HIERARCHY } from "@quikit/shared";

const ADMIN_MIN_LEVEL = ROLE_HIERARCHY[ROLES.ADMIN];

type KPIForPermission = {
  kpiLevel?: string | null;
  createdBy?: string;
  owner?: string | null;
  ownerIds?: string[] | null;
  team?: { headId?: string | null } | null;
};

/**
 * Client-side permission check — mirrors the server-side `canEditKPI` helper
 * (`@/lib/api/kpiPermissions`). The server is always the source of truth; this
 * is a UX hint so we can grey-out edit controls.
 *
 * Allowed when ANY of:
 *   - Creator (`kpi.createdBy === userId`)
 *   - Individual KPI assignee (`kpi.owner === userId`)
 *   - Team KPI owner (userId in `kpi.ownerIds`)
 *   - Team head (via `kpi.team.headId`, for team-level KPIs)
 *   - Admin-level role
 *   - Super-admin
 */
export function useCanEditKPI(kpi: KPIForPermission | null | undefined): boolean {
  const { data: session } = useSession();
  if (!kpi || !session?.user?.id) return false;

  const userId = session.user.id;

  // 1. Creator
  if (kpi.createdBy === userId) return true;

  // 2. Assignee (individual)
  if (kpi.kpiLevel !== "team" && kpi.owner === userId) return true;

  // 3. Assignee (team — any owner)
  if (kpi.kpiLevel === "team" && Array.isArray(kpi.ownerIds) && kpi.ownerIds.includes(userId)) {
    return true;
  }

  // 4. Team head
  if (kpi.kpiLevel === "team" && kpi.team?.headId === userId) return true;

  // 5. Admin role
  const role = (session.user as { membershipRole?: string }).membershipRole;
  if (role && (ROLE_HIERARCHY[role] ?? 0) >= ADMIN_MIN_LEVEL) return true;

  // 6. Super-admin
  if ((session.user as { isSuperAdmin?: boolean }).isSuperAdmin) return true;

  return false;
}

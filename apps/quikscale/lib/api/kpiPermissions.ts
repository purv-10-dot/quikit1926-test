import { db } from "@/lib/db";
import { ROLES, ROLE_HIERARCHY } from "@quikit/shared";

const ADMIN_MIN_LEVEL = ROLE_HIERARCHY[ROLES.ADMIN];

type KPIForPermission = {
  kpiLevel: string | null;
  createdBy: string;
  owner: string | null;
  ownerIds: string[] | null;
  teamId: string | null;
};

/**
 * Returns true when the user is allowed to update or delete the given KPI.
 *
 * Rules (ANY of):
 *   - Creator (`kpi.createdBy === userId`)
 *   - Individual KPI assignee (`kpi.owner === userId`)
 *   - Team KPI owner (userId is in `kpi.ownerIds`)
 *   - Team head (`Team.headId === userId`, for team-level KPIs)
 *   - Admin-level role on this tenant (role >= admin)
 *   - Super-admin flag on the user
 *
 * Server-only helper. Pairs with the client-side `useCanEditKPI` hook.
 */
export async function canEditKPI(
  userId: string,
  orgId: string,
  kpi: KPIForPermission,
): Promise<boolean> {
  if (!userId || !orgId || !kpi) return false;

  // 1. Creator always wins
  if (kpi.createdBy === userId) return true;

  // 2. Assignee — individual KPI
  if (kpi.kpiLevel !== "team" && kpi.owner === userId) return true;

  // 3. Assignee — team KPI: any user in ownerIds
  if (kpi.kpiLevel === "team" && Array.isArray(kpi.ownerIds) && kpi.ownerIds.includes(userId)) {
    return true;
  }

  // 4. Admin role on this tenant
  const membership = await db.membership.findFirst({
    where: { userId, orgId, status: "active" },
    select: { role: true },
  });
  if (membership) {
    const level = ROLE_HIERARCHY[membership.role] ?? 0;
    if (level >= ADMIN_MIN_LEVEL) return true;
  }

  // 5. Team head (team-level KPIs)
  if (kpi.kpiLevel === "team" && kpi.teamId) {
    const team = await db.team.findFirst({
      where: { id: kpi.teamId, orgId },
      select: { headId: true },
    });
    if (team && team.headId === userId) return true;
  }

  // 6. Super-admin (boolean flag on User)
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { isSuperAdmin: true },
  });
  return !!user?.isSuperAdmin;
}

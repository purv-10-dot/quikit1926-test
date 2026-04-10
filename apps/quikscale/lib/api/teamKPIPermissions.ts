import { db } from "@/lib/db";
import { ROLES, ROLE_HIERARCHY } from "@quikit/shared";

const ADMIN_MIN_LEVEL = ROLE_HIERARCHY[ROLES.ADMIN];

/**
 * Returns true when the user is allowed to create, edit, or delete Team KPIs
 * belonging to the given team.
 *
 * Permission rules:
 *   - The user has an active Membership in the tenant with role >= admin, OR
 *   - The user is the Team.headId for that team (and the team belongs to the tenant)
 *
 * Server-only helper. Use in API route handlers before performing any write
 * against a KPI where `kpiLevel === "team"`.
 */
export async function canManageTeamKPI(
  userId: string,
  tenantId: string,
  teamId: string
): Promise<boolean> {
  if (!userId || !tenantId || !teamId) return false;

  // 1. Admin-level role check via Membership
  const membership = await db.membership.findFirst({
    where: { userId, tenantId, status: "active" },
    select: { role: true },
  });
  if (membership) {
    const level = ROLE_HIERARCHY[membership.role] ?? 0;
    if (level >= ADMIN_MIN_LEVEL) return true;
  }

  // 2. Team head check
  const team = await db.team.findFirst({
    where: { id: teamId, tenantId },
    select: { headId: true },
  });
  return !!team && team.headId === userId;
}

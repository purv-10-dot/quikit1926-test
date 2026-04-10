import { db } from "@/lib/db";
import { ROLES, ROLE_HIERARCHY } from "@quikit/shared";

const ADMIN_MIN_LEVEL = ROLE_HIERARCHY[ROLES.ADMIN];

/**
 * Returns true when `actorUserId` is allowed to create/update a weekly value
 * on behalf of `targetOwnerUserId` for the given KPI.
 *
 * Permission rules:
 *   - The actor has an admin-level role in the tenant (admin, executive, super_admin), OR
 *   - For TEAM KPIs: the actor is the team's Team.headId, OR
 *   - For TEAM KPIs: the actor IS the target user AND the target is listed in kpi.ownerIds
 *   - For INDIVIDUAL KPIs: the actor is kpi.owner AND that's the targetOwnerUserId
 *
 * Server-only helper. Use inside API route handlers before any write to KPIWeeklyValue.
 */
export async function canEditKPIOwnerWeekly(
  actorUserId: string,
  tenantId: string,
  kpiId: string,
  targetOwnerUserId: string
): Promise<boolean> {
  if (!actorUserId || !tenantId || !kpiId || !targetOwnerUserId) return false;

  // 1. Admin-level role check via Membership
  const membership = await db.membership.findFirst({
    where: { userId: actorUserId, tenantId, status: "active" },
    select: { role: true },
  });
  if (membership) {
    const level = ROLE_HIERARCHY[membership.role] ?? 0;
    if (level >= ADMIN_MIN_LEVEL) return true;
  }

  // 2. Load the KPI — need kpiLevel, owner, teamId, ownerIds
  const kpi = await db.kPI.findUnique({
    where: { id: kpiId },
    select: { tenantId: true, kpiLevel: true, owner: true, teamId: true, ownerIds: true },
  });
  if (!kpi || kpi.tenantId !== tenantId) return false;

  if (kpi.kpiLevel === "individual") {
    // Actor must be the KPI owner AND the targetOwnerUserId must be the same.
    return kpi.owner === actorUserId && targetOwnerUserId === kpi.owner;
  }

  // Team KPI: target must be in ownerIds; actor must be either the team head OR the target self
  const ownerIds = (kpi.ownerIds ?? []) as string[];
  if (!ownerIds.includes(targetOwnerUserId)) return false;

  // Self-edit: owner entering their own row
  if (actorUserId === targetOwnerUserId) return true;

  // Team head check
  if (kpi.teamId) {
    const team = await db.team.findFirst({
      where: { id: kpi.teamId, tenantId },
      select: { headId: true },
    });
    if (team?.headId === actorUserId) return true;
  }

  return false;
}

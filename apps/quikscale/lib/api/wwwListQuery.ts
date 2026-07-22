/**
 * Shared WWW list scoping — orgId tenant filter + trash toggle + status filter
 * + row-level visibility (`who`), EXCLUDING free-text search and ordering.
 *
 * Extracted from `GET /api/www` so the WWW export route reuses the exact same
 * tenant-isolation + visibility.
 */
import { Prisma } from "@quikit/database";
import { db } from "@/lib/db";
import { isOrgAdmin } from "@/lib/api/visibility";

export interface WwwScopeParams {
  /** Single value or comma-separated set (`on-track,behind-schedule`). */
  status?: string;
  who?: string;
  teamId?: string;
  includeDeleted?: boolean;
}

export async function buildWwwScopeWhere(
  ctx: { orgId: string; userId: string },
  params: WwwScopeParams,
): Promise<Prisma.WWWItemWhereInput> {
  const { orgId, userId } = ctx;
  const where: Prisma.WWWItemWhereInput = { orgId };
  where.deletedAt = params.includeDeleted ? { not: null } : null;

  if (params.status) {
    const statuses = params.status.split(",").map((s) => s.trim()).filter(Boolean);
    if (statuses.length === 1) where.status = statuses[0];
    else if (statuses.length > 1) where.status = { in: statuses };
    else where.status = "__none__";
  }

  // Admins see all; non-admins see only items assigned to them (`who`). An
  // explicit who/team filter only NARROWS within the admin scope.
  const admin = await isOrgAdmin(userId, orgId);
  if (!admin) {
    where.who = userId;
  } else if (params.who) {
    where.who = params.who;
  } else if (params.teamId) {
    const members = await db.orgMember.findMany({
      where: { orgId, teamId: params.teamId, status: "active" },
      select: { userId: true },
    });
    const memberIds = members.map((m) => m.userId);
    where.who = memberIds.length > 0 ? { in: memberIds } : "__no_team_members__";
  }

  return where;
}

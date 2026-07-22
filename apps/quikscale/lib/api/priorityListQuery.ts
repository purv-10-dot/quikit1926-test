/**
 * Shared Priority list scoping — orgId tenant filter + trash toggle + column
 * filters + row-level visibility, EXCLUDING free-text search and ordering.
 *
 * Extracted from `GET /api/priority` so the Priority export route reuses the
 * exact same tenant-isolation + visibility. Divergence would let an export
 * leak rows the list hides.
 */
import { Prisma } from "@quikit/database";
import { db } from "@/lib/db";
import { isOrgAdmin } from "@/lib/api/visibility";

export interface PriorityScopeParams {
  year?: number;
  quarter?: string;
  status?: string;
  owner?: string;
  teamId?: string;
  includeDeleted?: boolean;
}

export async function buildPriorityScopeWhere(
  ctx: { orgId: string; userId: string },
  params: PriorityScopeParams,
): Promise<Prisma.PriorityWhereInput> {
  const { orgId, userId } = ctx;
  const where: Prisma.PriorityWhereInput = { orgId };
  where.deletedAt = params.includeDeleted ? { not: null } : null;
  if (params.year) where.year = params.year;
  if (params.quarter) where.quarter = params.quarter;
  if (params.status) where.overallStatus = params.status;

  // Admins see all; non-admins are pinned to their own priorities. An explicit
  // owner/team filter only NARROWS within the admin scope.
  const admin = await isOrgAdmin(userId, orgId);
  if (!admin) {
    where.owner = userId;
  } else if (params.owner) {
    where.owner = params.owner;
  } else if (params.teamId) {
    const members = await db.orgMember.findMany({
      where: { orgId, teamId: params.teamId, status: "active" },
      select: { userId: true },
    });
    const memberIds = members.map((m) => m.userId);
    where.owner = memberIds.length > 0 ? { in: memberIds } : "__no_team_members__";
  }

  return where;
}

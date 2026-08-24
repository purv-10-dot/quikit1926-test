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
import { parseMultiFilter } from "@/lib/api/multiFilter";
import { overdueWhere } from "@/lib/services/wwwLifecycle";

export interface WwwScopeParams {
  /** Single value or comma-separated set (`on-track,behind-schedule`). */
  status?: string;
  /** Single user id or comma-separated set (`u1,u2`) — multi-select "Who". */
  who?: string;
  teamId?: string;
  includeDeleted?: boolean;
  /**
   * Restrict to overdue items only.
   *
   * Uses `overdueWhere` from `lib/services/wwwLifecycle.ts` — the same rules as
   * the in-memory `isOverdue` predicate, so a filtered list and its own row
   * badges cannot contradict each other, and so this agrees with the
   * performance scorecard and QuikFlow's overdue notification.
   */
  overdue?: boolean;
}

export async function buildWwwScopeWhere(
  ctx: { orgId: string; userId: string },
  params: WwwScopeParams,
): Promise<Prisma.WWWItemWhereInput> {
  const { orgId, userId } = ctx;
  const where: Prisma.WWWItemWhereInput = { orgId };
  where.deletedAt = params.includeDeleted ? { not: null } : null;

  // Multi-select: one value stays a scalar equality, several become an IN.
  const statusFilter = parseMultiFilter(params.status);
  if (statusFilter !== undefined) where.status = statusFilter;

  // Admins see all; non-admins see only items assigned to them (`who`). An
  // explicit who/team filter only NARROWS within the admin scope.
  const admin = await isOrgAdmin(userId, orgId);
  const whoFilter = parseMultiFilter(params.who);
  if (!admin) {
    where.who = userId;
  } else if (whoFilter !== undefined) {
    where.who = whoFilter;
  } else if (params.teamId) {
    const members = await db.orgMember.findMany({
      where: { orgId, teamId: params.teamId, status: "active" },
      select: { userId: true },
    });
    const memberIds = members.map((m) => m.userId);
    where.who = memberIds.length > 0 ? { in: memberIds } : "__no_team_members__";
  }

  // Overdue is DERIVED, not stored (see wwwLifecycle.ts). This fragment mirrors
  // the predicate exactly: past its REAL due date, not to-be-decided, and not
  // closed. Merged under AND so it composes with an explicit status filter
  // rather than silently replacing it.
  if (params.overdue) {
    const od = overdueWhere();
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      { when: od.when, dueDateTBD: od.dueDateTBD, status: od.status },
    ];
  }

  return where;
}

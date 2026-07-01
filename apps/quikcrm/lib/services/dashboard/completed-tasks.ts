/**
 * Completed-tasks-in-window, per rep — the digest §4 data source (Stage C).
 *
 * Tasks COMPLETED within the rolling window, grouped by assignee, tier-scoped.
 * Scoping MIRRORS the activity metrics EXACTLY (role-based tier via
 * resolveManagerTeam — the shipped SalesGroup mechanism, NOT getScope/
 * resolveTeamScope which hit the unshipped CrmTeamManager table), swapping the
 * owner field ownerId → assignedToUserId (CrmTask's owner):
 *   - Administrator → org-only
 *   - SalesManager  → assignedToUserId ∈ resolveManagerTeam memberIds (own-fallback)
 *   - SalesUser/etc → assignedToUserId = self
 *
 * "Completed in window" = status=Completed AND completedAt ∈ [from, to). The
 * completedAt bound is non-null, so pre-column completions (completedAt NULL) are
 * excluded automatically — forward-counting, by construction.
 */

import { prisma } from "@/lib/db/prisma";
import { resolveManagerTeam } from "@/lib/services/dashboard/team";
import type { SessionUser } from "@/types/permission";
import type { CrmTaskStatus } from "@prisma/client";

export interface CompletedTaskRep {
  userId: string;
  ownerName: string | null;
  count: number;
}
export interface CompletedTasksResult {
  perRep: CompletedTaskRep[];
  total: number;
}

/** assignee restriction for the caller's tier (mirrors the activity ownerId scope). */
async function assigneeScope(user: SessionUser): Promise<Record<string, unknown>> {
  if (user.role === "Administrator") return {}; // org-only (orgId filter applied separately)
  if (user.role === "SalesManager") {
    const team = await resolveManagerTeam(user);
    const memberIds = team?.memberIds ?? [];
    return memberIds.length > 0
      ? { assignedToUserId: { in: memberIds } }
      : { assignedToUserId: user.userId }; // own-only fallback (parity with role-metrics)
  }
  return { assignedToUserId: user.userId }; // SalesUser / others → own-only
}

export async function getCompletedTasksByRep(
  user: SessionUser,
  opts: { range: { from: Date; to: Date } },
): Promise<CompletedTasksResult> {
  const scope = await assigneeScope(user);

  const rows = await prisma.crmTask.groupBy({
    by: ["assignedToUserId"],
    where: {
      orgId: user.orgId,
      status: "Completed" as CrmTaskStatus,
      // window + excludes NULL completedAt (pre-column completions never match).
      completedAt: { gte: opts.range.from, lt: opts.range.to },
      ...scope,
    },
    _count: { _all: true },
  });

  const withId = rows.filter((r) => r.assignedToUserId != null);
  const userIds = withId.map((r) => r.assignedToUserId as string);

  // Resolve names (CrmTask has no denormalized assignee name — look up User).
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const nameById = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));

  const perRep: CompletedTaskRep[] = withId.map((r) => ({
    userId: r.assignedToUserId as string,
    ownerName: nameById.get(r.assignedToUserId as string) ?? null,
    count: r._count._all,
  }));
  const total = perRep.reduce((s, r) => s + r.count, 0);

  return { perRep, total };
}

/**
 * Resolve a Sales Manager's "team" membership.
 *
 * The reference (Mongo) backend used `CrmUser.reportingManagerId`; this
 * monorepo doesn't have a CrmUser model so we resolve team membership through
 * `CrmSalesGroupManager → CrmSalesGroupMember`. A manager's team = the union
 * of users who are members of any group the manager manages.
 *
 * Returns IDs first (preferred join), but also surfaces denormalized names so
 * historical rows that lack `ownerId` (QceCallLog row written before the
 * agent-id wiring landed) can still be matched as a fallback. This is the
 * P2.7 "ownerId-first, name-fallback" rule.
 */

import { prisma } from "@/lib/db/prisma";
import { db } from "@/lib/db";
import type { SessionUser } from "@/types/permission";

export type Team = {
  /** User IDs of direct reports (preferred join key). */
  memberIds: string[];
  /** Denormalized names ("First Last") for historical row matching. */
  memberNames: string[];
  size: number;
};

export async function resolveManagerTeam(user: SessionUser): Promise<Team | null> {
  if (user.role !== "SalesManager") return null;

  const managed = await prisma.qceSalesGroupManager.findMany({
    where: { userId: user.userId },
    select: { groupId: true, group: { select: { orgId: true } } },
  });
  // Defensive tenant filter — the manager link table doesn't carry tenantId
  // directly, so trust the join.
  const groupIds = managed
    .filter((g) => g.group.orgId === user.orgId)
    .map((g) => g.groupId);
  if (groupIds.length === 0) {
    return { memberIds: [], memberNames: [], size: 0 };
  }

  const memberRows = await prisma.qceSalesGroupMember.findMany({
    where: { groupId: { in: groupIds } },
    select: { userId: true },
  });
  const memberIds = [...new Set(memberRows.map((r) => r.userId))];

  if (memberIds.length === 0) {
    return { memberIds: [], memberNames: [], size: 0 };
  }

  const users = await db.user.findMany({
    where: { id: { in: memberIds } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  const memberNames = users
    .map((u) => `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim())
    .filter((n) => n.length > 0);

  return {
    memberIds,
    memberNames,
    size: memberIds.length,
  };
}

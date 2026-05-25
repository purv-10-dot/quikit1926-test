import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/**
 * Task-group service. Centralizes the invariants:
 *  - Every project has a default "Ungrouped" row (auto-seeded on first
 *    activation). It cannot be deleted; tasks fall back to it when any
 *    other group is removed.
 *  - `groupId` is INDEPENDENT of `statusId`. None of the helpers in this
 *    file ever touch `statusId`.
 *  - Reorder uses contiguous integers — each set-mutation is wrapped in a
 *    single transaction so positions never go out of sync.
 */

export const DEFAULT_GROUP_NAME = "Ungrouped";

export async function ensureDefaultGroup(
  orgId: string,
  projectId: string,
  userId: string | null,
) {
  const existing = await db.qtTaskGroup.findFirst({
    where: { projectId, isDefault: true, isDeleted: false },
  });
  if (existing) return existing;
  try {
    return await db.qtTaskGroup.create({
      data: {
        orgId,
        projectId,
        name: DEFAULT_GROUP_NAME,
        color: "#3b82f6",
        order: 0,
        isDefault: true,
        createdBy: userId,
        updatedBy: userId,
      },
    });
  } catch (e: unknown) {
    const winner = await db.qtTaskGroup.findFirst({
      where: { projectId, isDefault: true, isDeleted: false },
    });
    if (winner) return winner;
    throw e;
  }
}

export async function nextGroupOrder(projectId: string): Promise<number> {
  const last = await db.qtTaskGroup.findFirst({
    where: { projectId, isDeleted: false },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  return (last?.order ?? -1) + 1;
}

export async function reindexGroupTasks(
  tx: Prisma.TransactionClient,
  groupId: string | null,
  projectId: string,
): Promise<void> {
  const rows = await tx.qtIssue.findMany({
    where: { projectId, groupId, isDeleted: false },
    orderBy: [{ orderInGroup: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  await Promise.all(
    rows.map((r, idx) =>
      tx.qtIssue.update({
        where: { id: r.id },
        data: { orderInGroup: idx },
      }),
    ),
  );
}

export async function moveTaskToGroup(args: {
  orgId: string;
  projectId: string;
  issueId: string;
  toGroupId: string | null;
  toIndex: number;
}): Promise<void> {
  const { orgId, projectId, issueId, toGroupId, toIndex } = args;
  await db.$transaction(async (tx) => {
    const issue = await tx.qtIssue.findFirst({
      where: { id: issueId, orgId, projectId, isDeleted: false },
      select: { id: true, groupId: true, orderInGroup: true },
    });
    if (!issue) throw new Error("Issue not found");

    if (issue.groupId === toGroupId && issue.orderInGroup === toIndex) return;

    if (issue.groupId !== toGroupId) {
      await tx.qtIssue.updateMany({
        where: {
          projectId,
          groupId: issue.groupId,
          orderInGroup: { gt: issue.orderInGroup },
          isDeleted: false,
        },
        data: { orderInGroup: { decrement: 1 } },
      });
      await tx.qtIssue.updateMany({
        where: {
          projectId,
          groupId: toGroupId,
          orderInGroup: { gte: toIndex },
          isDeleted: false,
        },
        data: { orderInGroup: { increment: 1 } },
      });
    } else {
      const from = issue.orderInGroup;
      const to = toIndex;
      if (from < to) {
        await tx.qtIssue.updateMany({
          where: {
            projectId,
            groupId: toGroupId,
            orderInGroup: { gt: from, lte: to },
            isDeleted: false,
          },
          data: { orderInGroup: { decrement: 1 } },
        });
      } else if (from > to) {
        await tx.qtIssue.updateMany({
          where: {
            projectId,
            groupId: toGroupId,
            orderInGroup: { gte: to, lt: from },
            isDeleted: false,
          },
          data: { orderInGroup: { increment: 1 } },
        });
      }
    }

    await tx.qtIssue.update({
      where: { id: issueId },
      data: { groupId: toGroupId, orderInGroup: toIndex },
    });
  });
}

export async function softDeleteGroup(args: {
  orgId: string;
  projectId: string;
  groupId: string;
  userId: string | null;
}): Promise<void> {
  const { orgId, projectId, groupId, userId } = args;
  await db.$transaction(async (tx) => {
    await tx.qtIssue.updateMany({
      where: { orgId, projectId, groupId, isDeleted: false },
      data: { groupId: null, updatedBy: userId },
    });
    await reindexGroupTasks(tx, null, projectId);
    await tx.qtTaskGroup.update({
      where: { id: groupId },
      data: { isDeleted: true, updatedBy: userId },
    });
  });
}

export async function reorderGroups(
  projectId: string,
  orderedIds: string[],
): Promise<void> {
  await db.$transaction(
    orderedIds.map((id, idx) =>
      db.qtTaskGroup.update({
        where: { id },
        data: { order: idx },
      }),
    ),
  );
}

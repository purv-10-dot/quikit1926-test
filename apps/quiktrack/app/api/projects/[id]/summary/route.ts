import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";

export const GET = withProjectAccess<{ id: string }>(
  async ({ projectId }) => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [
      statusGroups,
      typeGroups,
      priorityGroups,
      assigneeGroups,
      totalIssues,
      updatedRecently,
      createdRecently,
      dueSoon,
      statuses,
    ] = await Promise.all([
      db.qtIssue.groupBy({
        by: ["statusId"],
        where: { projectId, isDeleted: false },
        _count: { _all: true },
      }),
      db.qtIssue.groupBy({
        by: ["type"],
        where: { projectId, isDeleted: false },
        _count: { _all: true },
      }),
      db.qtIssue.groupBy({
        by: ["priority"],
        where: { projectId, isDeleted: false },
        _count: { _all: true },
      }),
      db.qtIssue.groupBy({
        by: ["assigneeId"],
        where: { projectId, isDeleted: false },
        _count: { _all: true },
      }),
      db.qtIssue.count({ where: { projectId, isDeleted: false } }),
      db.qtIssue.count({
        where: { projectId, isDeleted: false, updatedAt: { gte: sevenDaysAgo } },
      }),
      db.qtIssue.count({
        where: { projectId, isDeleted: false, createdAt: { gte: sevenDaysAgo } },
      }),
      db.qtIssue.count({
        where: {
          projectId,
          isDeleted: false,
          dueDate: { gte: now, lte: sevenDaysAhead },
        },
      }),
      db.qtIssueStatus.findMany({
        where: { projectId, isDeleted: false },
        select: { id: true, name: true, color: true, category: true },
      }),
    ]);

    const statusName = new Map(statuses.map((s) => [s.id, s] as const));
    const doneStatusIds = statuses.filter((s) => s.category === "DONE").map((s) => s.id);

    const completedRecently = await db.qtIssue.count({
      where: {
        projectId,
        isDeleted: false,
        statusId: { in: doneStatusIds.length ? doneStatusIds : ["__none__"] },
        updatedAt: { gte: sevenDaysAgo },
      },
    });

    const byStatus = statusGroups.map((g) => ({
      statusId: g.statusId,
      name: statusName.get(g.statusId)?.name ?? "Unknown",
      color: statusName.get(g.statusId)?.color ?? "#94a3b8",
      category: statusName.get(g.statusId)?.category ?? "BACKLOG",
      count: g._count._all,
    }));

    const byType = typeGroups.map((g) => ({ type: g.type, count: g._count._all }));
    const byPriority = priorityGroups.map((g) => ({
      priority: g.priority,
      count: g._count._all,
    }));
    // Denormalize assignee user details so the Team workload widget can render
    // first/last names + avatars without a second round-trip per row.
    const assigneeUserIds = assigneeGroups
      .map((g) => g.assigneeId)
      .filter((id): id is string => Boolean(id));
    const assigneeUsers = assigneeUserIds.length
      ? await db.user.findMany({
          where: { id: { in: assigneeUserIds } },
          select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
        })
      : [];
    const userById = new Map(assigneeUsers.map((u) => [u.id, u] as const));

    const byAssignee = assigneeGroups.map((g) => {
      const u = g.assigneeId ? userById.get(g.assigneeId) ?? null : null;
      const name = u
        ? [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email
        : null;
      return {
        assigneeId: g.assigneeId,
        count: g._count._all,
        name,
        email: u?.email ?? null,
        avatar: u?.avatar ?? null,
      };
    });

    const doneCount = byStatus
      .filter((b) => doneStatusIds.includes(b.statusId))
      .reduce((acc, x) => acc + x.count, 0);
    const progress = totalIssues === 0 ? 0 : Math.round((doneCount / totalIssues) * 100);

    return NextResponse.json({
      success: true,
      data: {
        totalIssues,
        progress,
        doneCount,
        byStatus,
        byType,
        byPriority,
        byAssignee,
        recent: {
          completed: completedRecently,
          updated: updatedRecently,
          created: createdRecently,
          dueSoon,
        },
      },
    });
  },
  { paramKey: "id" },
);

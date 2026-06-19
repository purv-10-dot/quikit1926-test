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

    // ── Epic progress ──────────────────────────────────────────────────────
    // For each epic, bucket its child issues by status category (DONE /
    // IN_PROGRESS / everything-else = TO DO) so the Summary can render a
    // stacked progress bar per epic, Jira-style.
    const epics = await db.qtIssue.findMany({
      where: { projectId, isDeleted: false, type: "EPIC" },
      select: { id: true, key: true, title: true },
      orderBy: { createdAt: "asc" },
    });
    const categoryByStatusId = new Map(
      statuses.map((s) => [s.id, s.category] as const),
    );
    let epicProgress: Array<{
      id: string;
      key: string;
      title: string;
      done: number;
      inProgress: number;
      todo: number;
      total: number;
    }> = [];
    if (epics.length > 0) {
      const epicIds = epics.map((e) => e.id);
      const children = await db.qtIssue.findMany({
        where: { projectId, isDeleted: false, epicId: { in: epicIds } },
        select: { epicId: true, statusId: true },
      });
      const buckets = new Map<string, { done: number; inProgress: number; todo: number }>();
      for (const id of epicIds) buckets.set(id, { done: 0, inProgress: 0, todo: 0 });
      for (const c of children) {
        if (!c.epicId) continue;
        const b = buckets.get(c.epicId);
        if (!b) continue;
        const cat = categoryByStatusId.get(c.statusId);
        if (cat === "DONE") b.done += 1;
        else if (cat === "IN_PROGRESS") b.inProgress += 1;
        else b.todo += 1;
      }
      epicProgress = epics.map((e) => {
        const b = buckets.get(e.id) ?? { done: 0, inProgress: 0, todo: 0 };
        return {
          id: e.id,
          key: e.key,
          title: e.title,
          done: b.done,
          inProgress: b.inProgress,
          todo: b.todo,
          total: b.done + b.inProgress + b.todo,
        };
      });
    }

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
        epicProgress,
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

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess } from "@/lib/api/permissions";

/**
 * Time summary for a single task — used by the Project Reports drawer.
 *
 *   GET /api/reports/task-time/[id]?assigneeId=…
 *
 * Returns the task header, every timesheet entry for it (with logger
 * details), per-user breakdown, and a grand-total.
 */
export const GET = withOrgAuth<{ id: string }>(async ({ orgId, userId }, req, { params }) => {
  const url = new URL(req.url);
  const filterAssigneeId = url.searchParams.get("assigneeId");

  const task = await db.qtIssue.findFirst({
    where: { id: params.id, orgId, isDeleted: false },
    select: {
      id: true,
      key: true,
      title: true,
      type: true,
      projectId: true,
      eta: true,
      startDate: true,
      dueDate: true,
      statusId: true,
    },
  });
  if (!task) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  // Permission: global admin (tenant OR app admin) OR a member of the task's project.
  const isAdmin = await hasAdminAccess(userId, orgId);
  if (!isAdmin) {
    const member = await db.qtProjectMember.findFirst({
      where: { userId, projectId: task.projectId, isDeleted: false },
      select: { id: true },
    });
    if (!member) {
      return NextResponse.json({ success: false, error: "You don't have access to this." }, { status: 403 });
    }
  }

  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get("pageSize") ?? 10)));

  const entryWhere = {
    orgId,
    isDeleted: false,
    issueId: task.id,
    ...(filterAssigneeId
      ? filterAssigneeId === "null"
        ? { userId: undefined }
        : { userId: filterAssigneeId }
      : {}),
  };

  // Total + grand total + per-user breakdown all run against the unpaginated
  // set so the summary panel stays correct across pages.
  const [total, sumAll, byUser, entries] = await Promise.all([
    db.qtTimesheetEntry.count({ where: entryWhere }),
    db.qtTimesheetEntry.aggregate({ where: entryWhere, _sum: { hours: true } }),
    db.qtTimesheetEntry.groupBy({
      by: ["userId"],
      where: entryWhere,
      _sum: { hours: true },
    }),
    db.qtTimesheetEntry.findMany({
      where: entryWhere,
      orderBy: { entryDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        userId: true,
        entryDate: true,
        hours: true,
        description: true,
      },
    }),
  ]);

  const userIds = Array.from(
    new Set<string>([...entries.map((e) => e.userId), ...byUser.map((b) => b.userId)]),
  );
  const users = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
      })
    : [];
  const userById = new Map(
    users.map(
      (u) =>
        [
          u.id,
          {
            id: u.id,
            name: `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email,
            email: u.email,
            avatar: u.avatar,
          },
        ] as const,
    ),
  );

  const shapedEntries = entries.map((e) => ({
    id: e.id,
    user: userById.get(e.userId) ?? { id: e.userId, name: "Unknown", email: "", avatar: null },
    entryDate: e.entryDate,
    hours: e.hours,
    description: e.description,
  }));

  // Per-user breakdown from the full (unpaginated) set.
  const breakdown = byUser
    .map((b) => ({
      user: userById.get(b.userId) ?? {
        id: b.userId,
        name: "Unknown",
        email: "",
        avatar: null,
      },
      hours: b._sum.hours ?? 0,
    }))
    .sort((a, b) => b.hours - a.hours);

  const totalHours = sumAll._sum.hours ?? 0;

  return NextResponse.json({
    success: true,
    data: {
      task,
      entries: shapedEntries,
      breakdown,
      totalHours,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  });
});

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess } from "@/lib/api/permissions";

/**
 * Project Reports — aggregated task list across all projects the caller can
 * see. Returns the matching task rows plus headline counters (total, pending,
 * closed) and total ETA / actual-time hours for the filtered set.
 *
 * Query params:
 *   projectId    – scope to one project
 *   statusId     – filter by status row
 *   assigneeId   – filter by assignee
 *   from / to    – startDate range (ISO)
 *   month        – YYYY-MM convenience filter on startDate
 */
export const GET = withOrgAuth(async ({ orgId, userId }, req) => {
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const statusId = url.searchParams.get("statusId");
  // Status names are duplicated across projects (each project has its own
  // status set), so the filter UI dedupes by name and we match against name
  // here. statusId is kept for completeness/back-compat.
  const statusName = url.searchParams.get("statusName");
  const assigneeId = url.searchParams.get("assigneeId");
  const fromStr = url.searchParams.get("from");
  const toStr = url.searchParams.get("to");
  const month = url.searchParams.get("month"); // YYYY-MM

  let from: Date | null = fromStr ? new Date(fromStr) : null;
  let to: Date | null = toStr ? new Date(toStr) : null;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map((s) => Number(s));
    from = new Date(y!, m! - 1, 1);
    to = new Date(y!, m!, 1);
  }

  // Resolve which projects the caller can see. Global admins (tenant OR app
  // admin) see all; everyone else gets their explicit memberships.
  const isAdmin = await hasAdminAccess(userId, orgId);

  let projectIds: string[] | null = null;
  if (!isAdmin) {
    const memberships = await db.qtProjectMember.findMany({
      where: { userId, isDeleted: false },
      select: { projectId: true },
    });
    projectIds = memberships.map((m) => m.projectId);
    if (projectId && !projectIds.includes(projectId)) {
      return NextResponse.json({
        success: true,
        data: { tasks: [], summary: empty(), page: 1, pageSize: 10, total: 0, totalPages: 1 },
      });
    }
  }

  // The month picker filters by createdAt (every task has one). Start Date
  // filter is intentionally separate so users can also slice by planned start.
  const startDateStr = url.searchParams.get("startDate");
  const startDateRange = startDateStr
    ? (() => {
        const d = new Date(startDateStr);
        const next = new Date(d);
        next.setDate(next.getDate() + 1);
        return { gte: d, lt: next };
      })()
    : null;

  const where = {
    orgId,
    isDeleted: false,
    ...(projectId ? { projectId } : projectIds ? { projectId: { in: projectIds } } : {}),
    ...(statusId ? { statusId } : {}),
    ...(statusName ? { status: { name: statusName } } : {}),
    ...(assigneeId
      ? assigneeId === "null"
        ? { assigneeId: null }
        : { assigneeId }
      : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lt: to } : {}),
          },
        }
      : {}),
    ...(startDateRange ? { startDate: startDateRange } : {}),
  };

  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get("pageSize") ?? 10)));

  // First wave: page + every summary metric in one parallel batch. Closed
  // count is a relation filter on category=DONE so we avoid pulling status
  // ids client-side. Actual-time aggregate uses a relation filter on the
  // timesheet table so we don't need to materialize the full issue id list.
  const [total, closedCount, etaAgg, actualTotalAgg, tasks] = await Promise.all([
    db.qtIssue.count({ where }),
    db.qtIssue.count({ where: { ...where, status: { category: "DONE" } } }),
    db.qtIssue.aggregate({ where, _sum: { eta: true } }),
    db.qtTimesheetEntry.aggregate({
      where: {
        orgId,
        isDeleted: false,
        issue: where,
      },
      _sum: { hours: true },
    }),
    db.qtIssue.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        key: true,
        title: true,
        type: true,
        assigneeId: true,
        projectId: true,
        statusId: true,
        startDate: true,
        dueDate: true,
        eta: true,
        createdAt: true,
      },
    }),
  ]);
  const pendingCount = total - closedCount;

  // Hydrate references in one batch.
  const projIds = Array.from(new Set(tasks.map((t) => t.projectId)));
  const statusIds = Array.from(new Set(tasks.map((t) => t.statusId).filter(Boolean) as string[]));
  const userIds = Array.from(new Set(tasks.map((t) => t.assigneeId).filter(Boolean) as string[]));

  const [projects, statuses, users, actuals] = await Promise.all([
    db.qtProject.findMany({
      where: { id: { in: projIds }, orgId },
      select: { id: true, name: true, projectKey: true, color: true, icon: true },
    }),
    db.qtIssueStatus.findMany({
      where: { id: { in: statusIds } },
      select: { id: true, name: true, color: true, category: true },
    }),
    db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
    }),
    // Sum actual hours per task from the timesheet table.
    tasks.length > 0
      ? db.qtTimesheetEntry.groupBy({
          by: ["issueId"],
          where: { orgId, isDeleted: false, issueId: { in: tasks.map((t) => t.id) } },
          _sum: { hours: true },
        })
      : Promise.resolve([] as { issueId: string; _sum: { hours: number | null } }[]),
  ]);

  const projectById = new Map(projects.map((p) => [p.id, p] as const));
  const statusById = new Map(statuses.map((s) => [s.id, s] as const));
  const userById = new Map(users.map((u) => [u.id, u] as const));
  const actualByIssue = new Map<string, number>(
    actuals.map((a) => [a.issueId, a._sum.hours ?? 0] as const),
  );

  const shaped = tasks.map((t) => {
    const u = t.assigneeId ? userById.get(t.assigneeId) : null;
    return {
      id: t.id,
      key: t.key,
      title: t.title,
      type: t.type,
      project: projectById.get(t.projectId) ?? null,
      status: t.statusId ? statusById.get(t.statusId) ?? null : null,
      assignee: u
        ? {
            id: u.id,
            name: `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email,
            email: u.email,
            avatar: u.avatar,
          }
        : null,
      startDate: t.startDate,
      dueDate: t.dueDate,
      createdAt: t.createdAt,
      etaHours: t.eta ?? 0,
      actualHours: actualByIssue.get(t.id) ?? 0,
    };
  });

  const summary = {
    total,
    pending: pendingCount,
    closed: closedCount,
    estHours: etaAgg._sum.eta ?? 0,
    actualHours: actualTotalAgg?._sum.hours ?? 0,
  };

  return NextResponse.json({
    success: true,
    data: {
      tasks: shaped,
      summary,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  });
});

function empty() {
  return { total: 0, pending: 0, closed: 0, estHours: 0, actualHours: 0 };
}

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess, spaceAdminProjectIds } from "@/lib/api/permissions";

/**
 * Project Reports CSV export — server-side so it covers EVERY matching row, not
 * just the page the client happens to have loaded. Accepts the same filters as
 * GET /api/reports/tasks (projectId, statusName, assigneeId, startDate, month,
 * from, to) but ignores pagination, and streams back a downloadable CSV.
 */

// Safety ceiling so a pathological filter can't try to materialise the whole
// org. Far above any realistic single-month report.
const MAX_ROWS = 100_000;

function escapeCsv(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

export const GET = withOrgAuth(async ({ orgId, userId }, req) => {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    const statusId = url.searchParams.get("statusId");
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

    // Resolve which projects the caller can see — same rule as the report
    // endpoint: global admins see ALL; non-admins see ONLY their Space Admin
    // projects (none → empty export).
    const isAdmin = await hasAdminAccess(userId, orgId);
    let projectIds: string[] | null = null;
    if (!isAdmin) {
      projectIds = await spaceAdminProjectIds(userId, orgId);
      if (projectIds.length === 0 || (projectId && !projectIds.includes(projectId))) {
        return csvResponse(["S.No,Key,Task,Project,Assignee,Create Date,Status,Est (h),Actual (h)"], month);
      }
    }

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
        ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }
        : {}),
      ...(startDateRange ? { startDate: startDateRange } : {}),
    };

    // ALL matching rows (no skip/take) up to the safety cap.
    const tasks = await db.qtIssue.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: MAX_ROWS,
      select: {
        id: true,
        key: true,
        title: true,
        assigneeId: true,
        projectId: true,
        statusId: true,
        eta: true,
        createdAt: true,
      },
    });

    // Hydrate references + per-task logged hours in one batch.
    const projIds = Array.from(new Set(tasks.map((t) => t.projectId)));
    const statusIds = Array.from(new Set(tasks.map((t) => t.statusId).filter(Boolean) as string[]));
    const userIds = Array.from(new Set(tasks.map((t) => t.assigneeId).filter(Boolean) as string[]));

    const [projects, statuses, users, actuals] = await Promise.all([
      db.qtProject.findMany({ where: { id: { in: projIds }, orgId }, select: { id: true, name: true } }),
      db.qtIssueStatus.findMany({ where: { id: { in: statusIds } }, select: { id: true, name: true } }),
      db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true, email: true },
      }),
      tasks.length > 0
        ? db.qtTimesheetEntry.groupBy({
            by: ["issueId"],
            where: { orgId, isDeleted: false, issueId: { in: tasks.map((t) => t.id) } },
            _sum: { hours: true },
          })
        : Promise.resolve([] as { issueId: string; _sum: { hours: number | null } }[]),
    ]);

    const projectById = new Map(projects.map((p) => [p.id, p.name] as const));
    const statusById = new Map(statuses.map((s) => [s.id, s.name] as const));
    const userById = new Map(
      users.map((u) => [u.id, `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email] as const),
    );
    const actualByIssue = new Map<string, number>(
      actuals.map((a) => [a.issueId, a._sum.hours ?? 0] as const),
    );

    const header = "S.No,Key,Task,Project,Assignee,Create Date,Status,Est (h),Actual (h)";
    const lines = tasks.map((t, i) =>
      [
        String(i + 1),
        escapeCsv(t.key),
        escapeCsv(t.title),
        escapeCsv(t.projectId ? projectById.get(t.projectId) ?? "" : ""),
        escapeCsv(t.assigneeId ? userById.get(t.assigneeId) ?? "" : ""),
        t.createdAt.toISOString().slice(0, 10),
        escapeCsv(t.statusId ? statusById.get(t.statusId) ?? "" : ""),
        String(t.eta ?? 0),
        String(actualByIssue.get(t.id) ?? 0),
      ].join(","),
    );

    return csvResponse([header, ...lines], month);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Export failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});

function csvResponse(lines: string[], month: string | null): NextResponse {
  // Leading BOM so Excel reads UTF-8 names correctly.
  const body = "﻿" + lines.join("\n");
  const stamp = month && /^\d{4}-\d{2}$/.test(month) ? month : "all";
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="project-report-${stamp}.csv"`,
    },
  });
}

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess } from "@/lib/api/permissions";
import { customFiltersToWhere, parseCustomFilters } from "@/lib/customFields/filterQuery";

async function userIsProjectMember(
  userId: string,
  orgId: string,
  projectId: string,
): Promise<boolean> {
  if (await hasAdminAccess(userId, orgId)) return true;
  const pm = await db.qtProjectMember.findFirst({
    where: { projectId, userId, isDeleted: false },
    select: { id: true },
  });
  return !!pm;
}

/**
 * Batched per-section filtered counts for the backlog.
 *
 * Replaces the N+1 pattern (one `/api/issues?statusCounts=1&limit=1` per sprint
 * section) with a single grouped query, so applying a filter fires ONE request
 * regardless of how many sprints the project has.
 *
 * Accepts the same filter params the backlog sends to `/api/issues`
 * (search, statusId, assigneeId, type, priority, epicId, customFilters) — the
 * `where` here is a straight copy of that route's, minus the sprintId/parentId
 * clauses (we group by sprint instead) and always excluding EPIC/SUBTASK.
 *
 * Returns, keyed by `sprint:<id>` and `backlog`, the total and the
 * To Do / In Progress / Done split for the filtered set. Sprints with zero
 * matches are simply absent from the response (the client defaults them to 0).
 */
export const GET = withOrgAuth(async ({ orgId, userId }, req) => {
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json(
      { success: false, error: "projectId is required" },
      { status: 400 },
    );
  }
  const project = await db.qtProject.findFirst({
    where: { id: projectId, orgId, isDeleted: false },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
  }
  if (!(await userIsProjectMember(userId, orgId, projectId))) {
    return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
  }

  const filterType = url.searchParams.get("type");
  const filterStatusId = url.searchParams.get("statusId");
  const filterEpicId = url.searchParams.get("epicId");
  const filterAssigneeId = url.searchParams.get("assigneeId");
  const filterPriority = url.searchParams.get("priority");
  const search = url.searchParams.get("search")?.trim();
  const customFilters = parseCustomFilters(url.searchParams.get("customFilters"));
  const customFilterWhere = customFiltersToWhere(customFilters);

  // assigneeId: same four shapes as /api/issues (null / id / csv / null+ids).
  const assigneeClause: Prisma.QtIssueWhereInput | null = (() => {
    if (!filterAssigneeId) return null;
    const parts = filterAssigneeId.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return null;
    const wantsUnassigned = parts.includes("null");
    const ids = parts.filter((p) => p !== "null");
    if (wantsUnassigned && ids.length)
      return { OR: [{ assigneeId: null }, { assigneeId: { in: ids } }] };
    if (wantsUnassigned) return { assigneeId: null };
    if (ids.length === 1) return { assigneeId: ids[0] };
    return { assigneeId: { in: ids } };
  })();

  // A specific `type` filter wins; otherwise the backlog's structural exclusion.
  const typeWhere: Prisma.QtIssueWhereInput = filterType
    ? { type: filterType }
    : { type: { notIn: ["EPIC", "SUBTASK"] } };

  const where: Prisma.QtIssueWhereInput = {
    orgId,
    projectId,
    isDeleted: false,
    ...typeWhere,
    ...(filterStatusId ? { statusId: filterStatusId } : {}),
    ...(filterEpicId === "null"
      ? { epicId: null }
      : filterEpicId
        ? { epicId: filterEpicId }
        : {}),
    ...(filterPriority ? { priority: filterPriority } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" as const } },
            { description: { contains: search, mode: "insensitive" as const } },
            { key: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(customFilterWhere.length || assigneeClause
      ? { AND: [...customFilterWhere, ...(assigneeClause ? [assigneeClause] : [])] }
      : {}),
  };

  // One grouped query covers every sprint + the backlog (sprintId null).
  const rows = await db.qtIssue.groupBy({
    by: ["sprintId", "statusId"],
    where,
    _count: { _all: true },
  });
  const statuses = await db.qtIssueStatus.findMany({
    where: { projectId, isDeleted: false },
    select: { id: true, category: true },
  });
  const catById = new Map(statuses.map((s) => [s.id, s.category] as const));

  const data: Record<
    string,
    { total: number; todo: number; inProgress: number; done: number }
  > = {};
  for (const r of rows) {
    const key = r.sprintId ? `sprint:${r.sprintId}` : "backlog";
    const bucket = (data[key] ||= { total: 0, todo: 0, inProgress: 0, done: 0 });
    const n = r._count._all;
    bucket.total += n;
    const cat = catById.get(r.statusId) ?? "BACKLOG";
    if (cat === "DONE") bucket.done += n;
    else if (cat === "IN_PROGRESS") bucket.inProgress += n;
    else bucket.todo += n;
  }

  return NextResponse.json({ success: true, data });
});

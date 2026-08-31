import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess } from "@/lib/api/permissions";
import {
  boardMappedStatusIds,
  issueFilterFragments,
  parseIssueFilters,
} from "@/lib/services/issueFilters";

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
 * Accepts the same filter params the backlog sends to `/api/issues`, and
 * builds its `where` from the SAME shared fragments (lib/services/issueFilters)
 * — minus the sprintId/parentId clauses, since it groups by sprint instead.
 * That sharing is load-bearing: these numbers label sections whose rows come
 * from `/api/issues`, so a filter honoured by one route and not the other
 * shows up as a section reading "2 work items" collapsed and "No items in this
 * sprint" once expanded. Do not hand-roll a clause here.
 *
 * Returns, keyed by `sprint:<id>` and `backlog`, the total and the
 * To Do / In Progress / Done split for the filtered set. Sprints with zero
 * matches are simply absent from the response (the client defaults them to 0).
 */
export const GET = withOrgAuth(async ({ orgId, userId }, req) => {
  const url = new URL(req.url);
  const idOrKey = url.searchParams.get("projectId");
  if (!idOrKey) {
    return NextResponse.json(
      { success: false, error: "projectId is required" },
      { status: 400 },
    );
  }
  // projectId query param may be a cuid or a project KEY (keys are per-org).
  const project = await db.qtProject.findFirst({
    where: { orgId, isDeleted: false, OR: [{ id: idOrKey }, { projectKey: idOrKey }] },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
  }
  const projectId = project.id;
  if (!(await userIsProjectMember(userId, orgId, projectId))) {
    return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
  }

  // Every filter clause comes from the shared builder, so this endpoint cannot
  // drift from the `/api/issues` query that produces the rows these numbers
  // are supposed to describe. `excludeType` defaults to the backlog's
  // structural EPIC/SUBTASK exclusion when the caller doesn't send one.
  const filters = parseIssueFilters(url);
  const fragments = issueFilterFragments({
    ...filters,
    excludeType: filters.excludeType ?? "EPIC,SUBTASK",
  });

  // The backlog only lists items whose status is mapped to a board column, so
  // a count describing it must hide the same items — otherwise a section reads
  // "2 work items" collapsed and "No items in this sprint" expanded.
  //
  // An explicit `statusId` filter takes precedence over the mapped-status
  // restriction, exactly as in `/api/issues` — the two must agree on this or
  // filtering by an unmapped status would produce the same contradiction in
  // the opposite direction.
  const mappedStatusIds =
    url.searchParams.get("boardMappedOnly") === "1" && !filters.statusId
      ? await boardMappedStatusIds(projectId)
      : null;

  const where: Prisma.QtIssueWhereInput = {
    orgId,
    projectId,
    isDeleted: false,
    ...(mappedStatusIds ? { statusId: { in: mappedStatusIds } } : {}),
    ...(fragments.length ? { AND: fragments } : {}),
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

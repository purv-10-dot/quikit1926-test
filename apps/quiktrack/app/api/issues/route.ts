import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { createIssueSchema } from "@/lib/validation/issue";
import { getDefaultStatusId } from "@/lib/services/projectDefaults";
import { recalcParentRollup } from "@/lib/services/subtaskRollup";
import { userCanInProject, forbidden } from "@/lib/api/permissions";

async function userIsProjectMember(
  userId: string,
  orgId: string,
  projectId: string,
): Promise<boolean> {
  const m = await db.orgMember.findFirst({
    where: { userId, orgId, status: "active" },
    select: { role: true },
  });
  if (m?.role === "admin" || m?.role === "owner") return true;
  const pm = await db.qtProjectMember.findFirst({
    where: { projectId, userId, isDeleted: false },
    select: { id: true },
  });
  return !!pm;
}

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
    where: { id: projectId, orgId: orgId, isDeleted: false },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
  }
  if (!(await userIsProjectMember(userId, orgId, projectId))) {
    return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
  }

  const filterType = url.searchParams.get("type");
  const excludeType = url.searchParams.get("excludeType");
  const filterStatusId = url.searchParams.get("statusId");
  const filterStatusCategoryRaw = url.searchParams.get("statusCategory");
  const filterStatusCategory =
    filterStatusCategoryRaw === "BACKLOG" ||
    filterStatusCategoryRaw === "IN_PROGRESS" ||
    filterStatusCategoryRaw === "DONE"
      ? filterStatusCategoryRaw
      : null;
  const filterSprintId = url.searchParams.get("sprintId");
  const filterParentId = url.searchParams.get("parentId");
  const filterEpicId = url.searchParams.get("epicId");
  const filterAssigneeId = url.searchParams.get("assigneeId");
  const filterPriority = url.searchParams.get("priority");
  const search = url.searchParams.get("search")?.trim();

  // Two pagination modes share this route:
  //   - cursor mode (board/backlog): `cursor` + `limit`
  //   - offset mode (list view):     `page` + `pageSize`
  // Offset wins when `page` is supplied; cursor remains the default for
  // existing callers that pass `limit` only.
  const cursor = url.searchParams.get("cursor");
  const limitParam = Number(url.searchParams.get("limit") || 0);
  const limit = limitParam > 0 ? Math.min(100, limitParam) : 0;
  const pageParam = Number(url.searchParams.get("page") || 0);
  const pageSizeParam = Number(url.searchParams.get("pageSize") || 0);
  const useOffset = pageParam > 0;
  const page = useOffset ? Math.max(1, pageParam) : 1;
  const pageSize = useOffset
    ? pageSizeParam > 0
      ? Math.min(200, pageSizeParam)
      : 50
    : 0;

  const sortKey = url.searchParams.get("sort") || "";
  const sortOrder = (url.searchParams.get("order") || "desc") as "asc" | "desc";
  const expand = url.searchParams.get("expand") === "true";

  // Allowlist of sortable columns → Prisma orderBy. Anything else falls back
  // to the board-default ordering so a stale URL param can't crash the route.
  const SORT_FIELDS = new Set([
    "key", "title", "type", "priority", "statusId",
    "assigneeId", "dueDate", "startDate", "createdAt", "updatedAt",
  ]);
  const orderBy: Prisma.QtIssueOrderByWithRelationInput[] = SORT_FIELDS.has(sortKey)
    ? [{ [sortKey]: sortOrder } as Prisma.QtIssueOrderByWithRelationInput, { id: sortOrder }]
    : [{ orderInColumn: "asc" }, { createdAt: "desc" }, { id: "asc" }];

  const where = {
    orgId: orgId,
    projectId,
    isDeleted: false,
    ...(filterType ? { type: filterType } : {}),
    ...(excludeType
      ? excludeType.includes(",")
        ? { type: { notIn: excludeType.split(",").filter(Boolean) } }
        : { type: { not: excludeType } }
      : {}),
    ...(filterStatusId ? { statusId: filterStatusId } : {}),
    ...(filterStatusCategory ? { status: { category: filterStatusCategory } } : {}),
    ...(filterSprintId === "null"
      ? { sprintId: null }
      : filterSprintId
        ? { sprintId: filterSprintId }
        : {}),
    ...(filterParentId === "null"
      ? { parentId: null }
      : filterParentId
        ? { parentId: filterParentId }
        : {}),
    ...(filterEpicId === "null"
      ? { epicId: null }
      : filterEpicId
        ? { epicId: filterEpicId }
        : {}),
    ...(filterAssigneeId === "null"
      ? { assigneeId: null }
      : filterAssigneeId
        ? { assigneeId: filterAssigneeId }
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
  };

  // Build pagination args separately — inlining a ternary spread confuses TS
  // into thinking required keys (skip/take) might be undefined.
  const paginationArgs: { skip?: number; take?: number; cursor?: { id: string } } = useOffset
    ? { skip: (page - 1) * pageSize, take: pageSize }
    : {
        ...(limit > 0 ? { take: limit + 1 } : {}),
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      };

  const issues = await db.qtIssue.findMany({
    where,
    orderBy,
    ...paginationArgs,
    select: {
      id: true,
      key: true,
      title: true,
      type: true,
      statusId: true,
      priority: true,
      parentId: true,
      epicId: true,
      sprintId: true,
      assigneeId: true,
      reporterId: true,
      startDate: true,
      dueDate: true,
      eta: true,
      storyPoints: true,
      orderInColumn: true,
      createdAt: true,
      updatedAt: true,
      // Live subtask count for the board's bookmark+N chip.
      _count: { select: { children: { where: { isDeleted: false } } } },
    },
  });

  const total = await db.qtIssue.count({ where });

  let nextCursor: string | null = null;
  let pageIssues = issues;
  if (!useOffset && limit > 0 && issues.length > limit) {
    pageIssues = issues.slice(0, limit);
    nextCursor = pageIssues[pageIssues.length - 1]?.id ?? null;
  }

  // ── Rolled-up ETA ─────────────────────────────────────────────────────────
  // For each issue in the page, compute total estimated hours from descendants.
  // We treat both `parentId` (subtask → parent) and `epicId` (task → epic)
  // as parent edges:
  //   - direct subtasks (parentId = issue.id)
  //   - direct epic children (epicId = issue.id, non-subtask)
  //
  // Crucially, we do NOT re-add the *grandkid* subtasks under epic children.
  // The subtaskRollup service writes each parent task's `eta` as the sum of
  // its subtasks' ETAs; summing the children's stored eta therefore already
  // includes their subtasks. Walking another level deep would double-count
  // (e.g. epic with task[eta=11h] containing 4h+7h subtasks → 11h, not 22h).
  const pageIds = pageIssues.map((i) => i.id);
  const rolledUpEtaById = new Map<string, number>();
  if (pageIds.length > 0) {
    const [byParent, byEpic] = await Promise.all([
      db.qtIssue.groupBy({
        by: ["parentId"],
        where: { parentId: { in: pageIds }, isDeleted: false },
        _sum: { eta: true },
      }),
      db.qtIssue.groupBy({
        by: ["epicId"],
        where: { epicId: { in: pageIds }, isDeleted: false, type: { not: "SUBTASK" } },
        _sum: { eta: true },
      }),
    ]);

    const directByParent = new Map<string, number>();
    for (const r of byParent) {
      if (r.parentId) directByParent.set(r.parentId, r._sum.eta ?? 0);
    }
    const directByEpic = new Map<string, number>();
    for (const r of byEpic) {
      if (r.epicId) directByEpic.set(r.epicId, r._sum.eta ?? 0);
    }

    // Count descendants per issue so we can tell "has children, use their sum"
    // from "no children, fall back to own eta". A 0-eta child still counts —
    // existence of the child is what matters, not whether it has an estimate yet.
    const [childCountByParent, childCountByEpic] = await Promise.all([
      db.qtIssue.groupBy({
        by: ["parentId"],
        where: { parentId: { in: pageIds }, isDeleted: false },
        _count: { _all: true },
      }),
      db.qtIssue.groupBy({
        by: ["epicId"],
        where: { epicId: { in: pageIds }, isDeleted: false, type: { not: "SUBTASK" } },
        _count: { _all: true },
      }),
    ]);
    const hasChildren = new Set<string>();
    for (const r of childCountByParent) {
      if (r.parentId && r._count._all > 0) hasChildren.add(r.parentId);
    }
    for (const r of childCountByEpic) {
      if (r.epicId && r._count._all > 0) hasChildren.add(r.epicId);
    }

    // Rule: when an issue has descendants, the descendants' total IS the
    // estimate (matches Jira / standard agile breakdown). The parent's own
    // `eta` field becomes vestigial — surface it separately as a stale hint
    // in the UI, but don't add it to the rollup. Leaves use their own eta.
    for (const issue of pageIssues) {
      const own = issue.eta ?? 0;
      const sub = directByParent.get(issue.id) ?? 0;
      const epicChildren = directByEpic.get(issue.id) ?? 0;
      const childTotal = sub + epicChildren;
      rolledUpEtaById.set(issue.id, hasChildren.has(issue.id) ? childTotal : own);
    }
  }

  // Optional join expansion for the list view — denormalizes status, sprint,
  // and user lookups so the client renders names/avatars without N+1 fetches.
  let statusMap: Map<string, { id: string; name: string; color: string; category: string }> = new Map();
  let sprintMap: Map<string, { id: string; name: string }> = new Map();
  let userMap: Map<string, { id: string; firstName: string | null; lastName: string | null; email: string; avatar: string | null }> = new Map();

  if (expand && pageIssues.length > 0) {
    const statusIds = Array.from(new Set(pageIssues.map((i) => i.statusId).filter(Boolean)));
    const sprintIds = Array.from(new Set(pageIssues.map((i) => i.sprintId).filter((x): x is string => Boolean(x))));
    const userIds = Array.from(
      new Set(
        pageIssues
          .flatMap((i) => [i.assigneeId, i.reporterId])
          .filter((x): x is string => Boolean(x)),
      ),
    );
    const [statuses, sprints, users] = await Promise.all([
      statusIds.length
        ? db.qtIssueStatus.findMany({
            where: { id: { in: statusIds } },
            select: { id: true, name: true, color: true, category: true },
          })
        : Promise.resolve([]),
      sprintIds.length
        ? db.qtSprint.findMany({
            where: { id: { in: sprintIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      userIds.length
        ? db.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
          })
        : Promise.resolve([]),
    ]);
    statusMap = new Map(statuses.map((s) => [s.id, s]));
    sprintMap = new Map(sprints.map((s) => [s.id, s]));
    userMap = new Map(users.map((u) => [u.id, u]));
  }

  const shaped = pageIssues.map(({ _count, ...rest }) => ({
    ...rest,
    subtaskCount: _count?.children ?? 0,
    rolledUpEta: rolledUpEtaById.get(rest.id) ?? rest.eta ?? 0,
    ...(expand
      ? {
          status: rest.statusId ? statusMap.get(rest.statusId) ?? null : null,
          sprint: rest.sprintId ? sprintMap.get(rest.sprintId) ?? null : null,
          assignee: rest.assigneeId ? userMap.get(rest.assigneeId) ?? null : null,
          reporter: rest.reporterId ? userMap.get(rest.reporterId) ?? null : null,
        }
      : {}),
  }));

  if (useOffset) {
    return NextResponse.json({
      success: true,
      data: shaped,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  }

  return NextResponse.json({ success: true, data: shaped, nextCursor, total });
});

export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const parsed = createIssueSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const project = await db.qtProject.findFirst({
    where: { id: parsed.data.projectId, orgId: orgId, isDeleted: false },
    select: { id: true, projectKey: true },
  });
  if (!project) {
    return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
  }
  if (!(await userIsProjectMember(userId, orgId, project.id))) {
    return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
  }
  if (!(await userCanInProject(userId, orgId, project.id, "Issue", "create"))) {
    return forbidden();
  }

  const issue = await db.$transaction(async (tx) => {
    const statusId =
      parsed.data.statusId ?? (await getDefaultStatusId(tx, project.id));
    if (!statusId) throw new Error("Project has no statuses");

    const seq = await tx.qtIssue.count({ where: { projectId: project.id } });
    const key = `${project.projectKey}-${seq + 1}`;

    return tx.qtIssue.create({
      data: {
        orgId: orgId,
        projectId: project.id,
        key,
        title: parsed.data.title,
        description: parsed.data.description,
        type: parsed.data.type,
        statusId,
        priority: parsed.data.priority,
        parentId: parsed.data.parentId,
        epicId: parsed.data.epicId,
        sprintId: parsed.data.sprintId,
        assigneeId: parsed.data.assigneeId,
        reporterId: userId,
        startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
        eta: parsed.data.eta,
        storyPoints: parsed.data.storyPoints,
        createdBy: userId,
        updatedBy: userId,
      },
    });
  });

  // Roll up ETA + dates onto the parent when this is a subtask.
  if (issue.type === "SUBTASK" && issue.parentId) {
    void recalcParentRollup(issue.parentId, orgId);
  }

  return NextResponse.json({ success: true, data: issue }, { status: 201 });
});

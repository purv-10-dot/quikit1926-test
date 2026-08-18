import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { createIssueSchema } from "@/lib/validation/issue";
import { getInitialStatusId, nextIssueKey } from "@/lib/services/projectDefaults";
import { recalcParentRollup } from "@/lib/services/subtaskRollup";
import { userCanInProject, forbidden, hasAdminAccess } from "@/lib/api/permissions";
import { notifyMentions } from "@/lib/services/mentions";
import { emailIssueAssigned } from "@/lib/email/sendEmail";
import { isEmailEnabled } from "@/lib/notifications/notify";
import { validateIssueValues, writeIssueValues } from "@/lib/services/customFieldValues";
import type { FieldValue } from "@/lib/customFields/registry";
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

// AI Runtime: agent-JWT opt-in (manifest read op `list_issues`). Reads only —
// the POST below deliberately stays session/API-token.
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

  const filterType = url.searchParams.get("type");
  const excludeType = url.searchParams.get("excludeType");
  const filterStatusId = url.searchParams.get("statusId");
  // Board columns can map several statuses to one column: `statusIds` is a
  // comma-separated IN-list. Takes precedence over the single `statusId`.
  const filterStatusIds = (url.searchParams.get("statusIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // When set (backlog/board), restrict to statuses that are mapped to a board
  // column. Items on unmapped statuses are hidden from the board+backlog (they
  // still show in List/Task Table, which don't pass this). No-op if the project
  // has no configured board columns (then nothing is "unmapped").
  const boardMappedOnly = url.searchParams.get("boardMappedOnly") === "1";
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
  // Releases (Fix Versions) are a many-to-many join (QtIssueRelease), unlike
  // sprint/epic which are direct columns — resolve to an id-IN filter instead
  // of a where-clause spread.
  const filterReleaseId = url.searchParams.get("releaseId");
  const filterAssigneeId = url.searchParams.get("assigneeId");
  const filterPriority = url.searchParams.get("priority");
  // When set, also return a To Do / In Progress / Done breakdown for the
  // filtered set (used by the backlog section badges so they reflect filters).
  const wantStatusCounts = url.searchParams.get("statusCounts") === "1";
  const search = url.searchParams.get("search")?.trim();
  // Custom field filters: JSON array of { fieldId, type, op, value, value2 }.
  const customFilters = parseCustomFilters(url.searchParams.get("customFilters"));
  const customFilterWhere = customFiltersToWhere(customFilters);

  // assigneeId supports four shapes, mirroring sprintId:
  //   "null"            → unassigned only
  //   "id"              → single assignee
  //   "id1,id2,id3"     → IN-list (multi-assignee filter)
  //   "null,id1,id2"    → unassigned OR any of the listed assignees
  // The clause is nested inside the top-level AND (below) rather than spread
  // directly, so its OR (mixed unassigned + ids case) can't collide with the
  // search OR.
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

  // Resolve the `type` clause ONCE. A specific `type` filter (e.g. BUG) wins over
  // `excludeType` (the section's structural EPIC/SUBTASK exclusion) — otherwise a
  // second `type:` key in the spread would clobber the first, so picking a type
  // silently fell back to "everything except epics/subtasks".
  const typeWhere: Prisma.QtIssueWhereInput = filterType
    ? { type: filterType }
    : excludeType
      ? excludeType.includes(",")
        ? { type: { notIn: excludeType.split(",").filter(Boolean) } }
        : { type: { not: excludeType } }
      : {};

  // Board-mapped restriction: the set of status ids that are mapped to a board
  // column. Only applied when the project actually has configured columns —
  // otherwise every status is effectively "on the board".
  let mappedStatusIds: string[] | null = null;
  if (boardMappedOnly) {
    const hasColumns = await db.qtBoardColumn.findFirst({
      where: { projectId },
      select: { id: true },
    });
    if (hasColumns) {
      const mapped = await db.qtBoardColumnStatus.findMany({
        where: { column: { projectId } },
        select: { statusId: true },
      });
      mappedStatusIds = mapped.map((m) => m.statusId);
    }
  }

  // Resolve the release's linked issue ids ONCE (outside the where object) so
  // an empty result set short-circuits to `{ id: { in: [] } }` instead of
  // silently matching every issue.
  let releaseIssueIds: string[] | null = null;
  if (filterReleaseId) {
    const links = await db.qtIssueRelease.findMany({
      where: { releaseId: filterReleaseId },
      select: { issueId: true },
    });
    releaseIssueIds = links.map((l) => l.issueId);
  }

  const where = {
    orgId: orgId,
    projectId,
    isDeleted: false,
    ...(releaseIssueIds ? { id: { in: releaseIssueIds } } : {}),
    ...typeWhere,
    ...(filterStatusIds.length > 0
      ? { statusId: { in: filterStatusIds } }
      : filterStatusId
        ? { statusId: filterStatusId }
        : mappedStatusIds
          ? { statusId: { in: mappedStatusIds } }
          : {}),
    ...(filterStatusCategory ? { status: { category: filterStatusCategory } } : {}),
    // sprintId supports three shapes:
    //   "null"           → unscoped issues (backlog)
    //   "id1,id2,id3"    → IN-list (multi-active-sprint board view)
    //   "id"             → single id, exact match
    //   absent           → no sprint filter
    ...(filterSprintId === "null"
      ? { sprintId: null }
      : filterSprintId
        ? filterSprintId.includes(",")
          ? {
              sprintId: {
                in: filterSprintId
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              },
            }
          : { sprintId: filterSprintId }
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

  // idsOnly mode: return every matching id for the current filter, unpaginated.
  // Used by the backlog's "select all in section" so a bulk move/edit can act on
  // items that haven't been scrolled into view yet (not just the loaded page).
  // Capped so a pathological selection can't return an unbounded payload.
  if (url.searchParams.get("idsOnly") === "1") {
    const rows = await db.qtIssue.findMany({
      where,
      orderBy,
      take: 5000,
      select: { id: true },
    });
    return NextResponse.json({ success: true, data: rows, total: rows.length });
  }

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

  // Optional filtered status breakdown. `todo` is the remainder so it covers the
  // BACKLOG category (and anything not DONE/IN_PROGRESS) without an extra query.
  let statusCounts: { todo: number; inProgress: number; done: number } | undefined;
  if (wantStatusCounts) {
    const [done, inProgress] = await Promise.all([
      db.qtIssue.count({ where: { AND: [where, { status: { category: "DONE" } }] } }),
      db.qtIssue.count({ where: { AND: [where, { status: { category: "IN_PROGRESS" } }] } }),
    ]);
    statusCounts = { done, inProgress, todo: Math.max(0, total - done - inProgress) };
  }

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

  return NextResponse.json({
    success: true,
    data: shaped,
    nextCursor,
    total,
    ...(statusCounts ? { statusCounts } : {}),
  });
}, { allowAgentJwt: true });

export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const parsed = createIssueSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  // Body projectId may be a cuid OR a project KEY (readable URLs). Resolve
  // either to the real id, org-scoped; project.id is used downstream.
  const project = await db.qtProject.findFirst({
    where: {
      orgId,
      isDeleted: false,
      OR: [{ id: parsed.data.projectId }, { projectKey: parsed.data.projectId }],
    },
    select: { id: true, projectKey: true, name: true },
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

  // Custom field values: the full create form sends `customFields` (enforcing
  // required fields). Quick/inline creators omit it and bypass enforcement —
  // values can be filled later on the issue.
  const customFields = parsed.data.customFields as Record<string, FieldValue> | undefined;
  if (customFields) {
    const valid = await validateIssueValues({
      orgId,
      projectId: project.id,
      values: customFields,
      enforceRequired: true,
    });
    if (!valid.ok) {
      return NextResponse.json({ success: false, error: valid.errors.join(", ") }, { status: 400 });
    }
  }

  const issue = await db.$transaction(async (tx) => {
    // New issues start on the workflow's INITIAL status (e.g. classic "Open")
    // when a published workflow governs the project; otherwise the first status
    // by order. A client-supplied status still wins.
    const statusId =
      parsed.data.statusId ?? (await getInitialStatusId(tx, project.id));
    if (!statusId) throw new Error("Project has no statuses");

    // Derive the key from the MAX existing suffix, not count()+1 — the latter
    // regenerates an existing key once any issue has been deleted, tripping the
    // QtIssue unique-key constraint.
    const key = await nextIssueKey(tx, project.id, project.projectKey);

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

  // Persist custom field values (pre-validated above).
  if (customFields) {
    await writeIssueValues({
      orgId,
      issueId: issue.id,
      projectId: project.id,
      actorId: userId,
      values: customFields,
    });
  }

  // Roll up ETA + dates onto the parent when this is a subtask.
  if (issue.type === "SUBTASK" && issue.parentId) {
    void recalcParentRollup(issue.parentId, orgId);
  }

  // Auto-watch: the reporter (always the creator) and the initial assignee
  // (if different) start watching, matching Jira's default. Manual unwatch
  // still works afterwards — this only seeds the initial watcher set.
  void db.qtIssueWatcher
    .createMany({
      data: [
        { orgId, issueId: issue.id, userId, source: "AUTO" },
        ...(issue.assigneeId && issue.assigneeId !== userId
          ? [{ orgId, issueId: issue.id, userId: issue.assigneeId, source: "AUTO" }]
          : []),
      ],
      skipDuplicates: true,
    })
    .catch((e) => console.error("[watch] auto-watch on create failed:", e));

  // Email anyone @-mentioned in the new issue's description.
  if (issue.description) {
    void notifyMentions({
      orgId,
      actorUserId: userId,
      issue: { id: issue.id, key: issue.key, title: issue.title, projectId: issue.projectId },
      context: "description",
      html: issue.description,
    });
  }

  // Email the assignee when a task is created already assigned to someone
  // other than its creator. Reassignment of an existing issue is handled by
  // the PATCH route's notifyOnUpdate; creation was the missing path (so tasks
  // created with an assignee from the header modal / backlog inline creator
  // never notified). Self-assignment is skipped — no point emailing yourself
  // about a task you just created. Fire-and-forget so a mail hiccup can't fail
  // the create.
  const assigneeId = issue.assigneeId;
  if (assigneeId && assigneeId !== userId) {
    void (async () => {
      try {
        const [assignee, actor] = await Promise.all([
          db.user.findUnique({
            where: { id: assigneeId },
            select: { email: true, firstName: true, lastName: true },
          }),
          db.user.findUnique({
            where: { id: userId },
            select: { email: true, firstName: true, lastName: true },
          }),
        ]);
        if (assignee?.email && (await isEmailEnabled(assigneeId))) {
          await emailIssueAssigned({
            to: assignee.email,
            assigneeName:
              [assignee.firstName, assignee.lastName].filter(Boolean).join(" ").trim() || null,
            issue: {
              id: issue.id,
              key: issue.key,
              title: issue.title,
              projectId: issue.projectId,
              projectName: project.name ?? null,
            },
            reassignedBy: actor
              ? [actor.firstName, actor.lastName].filter(Boolean).join(" ").trim() || actor.email
              : null,
          });
        }
      } catch (e) {
        console.error("[email] assignee-on-create failed:", e instanceof Error ? e.message : e);
      }
    })();
  }

  return NextResponse.json({ success: true, data: issue }, { status: 201 });
});

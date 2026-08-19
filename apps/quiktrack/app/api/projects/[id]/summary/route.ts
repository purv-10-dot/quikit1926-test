import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";

export const GET = withProjectAccess<{ id: string }>(
  async ({ projectId }, req) => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // ── Parse filter params ────────────────────────────────────────────────
    // Each param is a comma-joined list of ids/values. Assignees support the
    // literal token "unassigned" (assigneeId = null); parents support "none"
    // (parentId = null), mirroring the Jira "No parent" option.
    const searchParams = new URL(req.url).searchParams;
    const splitParam = (v: string | null) =>
      (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

    const statusesFilter = splitParam(searchParams.get("statuses"));
    const typesFilter = splitParam(searchParams.get("types"));
    const assigneesFilter = splitParam(searchParams.get("assignees"));
    const parentsFilter = splitParam(searchParams.get("parents"));

    // Build a shared where clause applied to every aggregation so the whole
    // Summary reflects the active filters server-side. Dimensions that may need
    // an OR (assignees / parents with a null token) are collected into an AND
    // array to avoid clobbering a single `OR` key.
    const filterWhere: Record<string, unknown> = {
      projectId,
      isDeleted: false,
    };
    const and: Record<string, unknown>[] = [];

    if (statusesFilter.length) {
      and.push({ statusId: { in: statusesFilter } });
    }
    if (typesFilter.length) {
      and.push({ type: { in: typesFilter } });
    }

    if (assigneesFilter.length) {
      const hasUnassigned = assigneesFilter.includes("unassigned");
      const otherIds = assigneesFilter.filter((v) => v !== "unassigned");
      if (hasUnassigned && otherIds.length) {
        and.push({ OR: [{ assigneeId: null }, { assigneeId: { in: otherIds } }] });
      } else if (hasUnassigned) {
        and.push({ assigneeId: null });
      } else {
        and.push({ assigneeId: { in: otherIds } });
      }
    }

    if (parentsFilter.length) {
      const hasNone = parentsFilter.includes("none");
      const otherIds = parentsFilter.filter((v) => v !== "none");
      if (hasNone && otherIds.length) {
        and.push({ OR: [{ parentId: null }, { parentId: { in: otherIds } }] });
      } else if (hasNone) {
        and.push({ parentId: null });
      } else {
        and.push({ parentId: { in: otherIds } });
      }
    }

    if (and.length) filterWhere.AND = and;

    // Child-issue conditions for epic progress: apply status + assignee only.
    // Type is excluded (children aren't epics) and parents is excluded (epicId
    // is the grouping used for epic progress).
    const childAnd: Record<string, unknown>[] = [];
    if (statusesFilter.length) {
      childAnd.push({ statusId: { in: statusesFilter } });
    }
    if (assigneesFilter.length) {
      const hasUnassigned = assigneesFilter.includes("unassigned");
      const otherIds = assigneesFilter.filter((v) => v !== "unassigned");
      if (hasUnassigned && otherIds.length) {
        childAnd.push({ OR: [{ assigneeId: null }, { assigneeId: { in: otherIds } }] });
      } else if (hasUnassigned) {
        childAnd.push({ assigneeId: null });
      } else {
        childAnd.push({ assigneeId: { in: otherIds } });
      }
    }

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
      allAssigneeGroups,
      allTypeGroups,
    ] = await Promise.all([
      db.qtIssue.groupBy({
        by: ["statusId"],
        where: filterWhere,
        _count: { _all: true },
      }),
      db.qtIssue.groupBy({
        by: ["type"],
        where: filterWhere,
        _count: { _all: true },
      }),
      db.qtIssue.groupBy({
        by: ["priority"],
        where: filterWhere,
        _count: { _all: true },
      }),
      db.qtIssue.groupBy({
        by: ["assigneeId"],
        where: filterWhere,
        _count: { _all: true },
      }),
      db.qtIssue.count({ where: filterWhere }),
      db.qtIssue.count({
        where: { ...filterWhere, updatedAt: { gte: sevenDaysAgo } },
      }),
      db.qtIssue.count({
        where: { ...filterWhere, createdAt: { gte: sevenDaysAgo } },
      }),
      db.qtIssue.count({
        where: {
          ...filterWhere,
          dueDate: { gte: now, lte: sevenDaysAhead },
        },
      }),
      // Status lookup stays UNfiltered — we need all names/colors for labels.
      db.qtIssueStatus.findMany({
        where: { projectId, isDeleted: false },
        select: { id: true, name: true, color: true, category: true },
      }),
      // UNfiltered option sources — the assignee/type dropdowns must always
      // offer every value the project has ever used, independent of the active
      // filter, so a narrow selection can still be widened back out.
      db.qtIssue.groupBy({
        by: ["assigneeId"],
        where: { projectId, isDeleted: false },
      }),
      db.qtIssue.groupBy({
        by: ["type"],
        where: { projectId, isDeleted: false },
      }),
    ]);

    const statusName = new Map(statuses.map((s) => [s.id, s] as const));
    const doneStatusIds = statuses.filter((s) => s.category === "DONE").map((s) => s.id);

    const completedRecently = await db.qtIssue.count({
      where: {
        ...filterWhere,
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
    // first/last names + avatars without a second round-trip per row. Include
    // the UNfiltered assignee ids too so the assignee option list can resolve
    // names for people filtered out of the current view.
    const assigneeUserIds = Array.from(
      new Set(
        [...assigneeGroups, ...allAssigneeGroups]
          .map((g) => g.assigneeId)
          .filter((id): id is string => Boolean(id)),
      ),
    );
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
    // stacked progress bar per epic, Jira-style. The epics list itself is
    // never filtered by the type filter (we always want the epic set); the
    // children query respects status + assignee filters via `childAnd`.
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
      const childWhere: Record<string, unknown> = {
        projectId,
        isDeleted: false,
        epicId: { in: epicIds },
      };
      if (childAnd.length) childWhere.AND = childAnd;
      const children = await db.qtIssue.findMany({
        where: childWhere,
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

    // ── Filter option lists (for the client dropdowns) ─────────────────────
    // Parents: issues that are themselves a parent of something, plus all
    // epics (Jira lists epics as parents). Deduped by id.
    const parentCandidates = await db.qtIssue.findMany({
      where: {
        projectId,
        isDeleted: false,
        OR: [{ children: { some: {} } }, { type: "EPIC" }],
      },
      select: { id: true, key: true, title: true },
      orderBy: { createdAt: "asc" },
    });
    const parentOptions = parentCandidates.map((p) => ({
      id: p.id,
      key: p.key,
      title: p.title,
    }));

    // Assignees: derived from UNfiltered data so the dropdown always lists every
    // assignee the project has ever used, regardless of the current filter.
    // Names resolve via the shared userById map ({ id, name }); nulls dropped.
    const assigneeOptions = allAssigneeGroups
      .map((g) => g.assigneeId)
      .filter((id): id is string => Boolean(id))
      .map((id) => {
        const u = userById.get(id) ?? null;
        const name = u
          ? [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email
          : null;
        return { id, name };
      })
      .filter((o): o is { id: string; name: string } => Boolean(o.name));

    const statusOptions = statuses.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
    }));

    // Types: derived from UNfiltered data so the dropdown always offers every
    // type present in the project, independent of the current filter.
    const typeOptions = Array.from(new Set(allTypeGroups.map((g) => g.type)));

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
        filterOptions: {
          parents: parentOptions,
          assignees: assigneeOptions,
          statuses: statusOptions,
          types: typeOptions,
        },
      },
    });
  },
  // `ProjectSummary:view` is what the manifest declares as this operation's
  // requiredPermission (see lib/api/aiManifest.ts, summarize_project). It was
  // declared before it was enforced — the route checked project MEMBERSHIP
  // only, so any member saw the summary whether or not their role granted it,
  // while the Summary tab's client gate hid it. Enforcing it here makes the
  // declaration true and closes that UI-only gap.
  //
  // Applies to both identity sources: `requirePermission` is evaluated inside
  // withProjectAccess after identity resolution, so a session caller and an
  // agent-JWT caller are gated identically.
  //
  // AI Runtime: agent-JWT opt-in (manifest read op `summarize_project`).
  {
    paramKey: "id",
    requirePermission: { resource: "ProjectSummary", action: "view" },
    allowAgentJwt: true,
  },
);

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { loadProjectAccess } from "@/lib/api/withProjectAccess";
import { ensureDefaultGroup } from "@/lib/services/groupService";

/**
 * GET /api/projects/[id]/grouped-board
 * Single-shot read for the Grouped Kanban surface. Returns groups (with
 * task counts) and their tasks, pre-bucketed server-side so the client can
 * render the full board on first paint without N+1 fetches.
 *
 * Tasks with `groupId = null` are folded into the default group's bucket
 * on the response — the client never sees a "null" group.
 */
export const GET = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const access = await loadProjectAccess(orgId, userId, params.id);
    if (!access) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 },
      );
    }
    const url = new URL(req.url);
    const sprintId = url.searchParams.get("sprintId");
    const assigneeId = url.searchParams.get("assigneeId");
    const priority = url.searchParams.get("priority");
    const type = url.searchParams.get("type");
    const search = url.searchParams.get("search")?.trim();

    const defaultGroup = await ensureDefaultGroup(orgId, params.id, userId);

    // Grouped Kanban is an active-work board: backlog tasks (sprintId=null)
    // and tasks in PLANNED / COMPLETED sprints are never shown. Multiple
    // sprints can be ACTIVE at once, so the default ("no sprintId" or
    // sprintId=all) unions every active sprint's tasks. A specific sprintId
    // is honored only if that sprint is currently active.
    const activeSprintRows = await db.qtSprint.findMany({
      where: { projectId: params.id, status: "ACTIVE", isDeleted: false },
      select: { id: true },
    });
    const activeSprintIds = activeSprintRows.map((s) => s.id);
    const wantsSpecificSprint =
      sprintId && sprintId !== "all" && sprintId !== "null";
    const sprintIdsToFilter = wantsSpecificSprint
      ? activeSprintIds.includes(sprintId)
        ? [sprintId]
        : [] // user picked a non-active sprint → return zero rows
      : activeSprintIds;

    const [groups, statuses, issues] = await Promise.all([
      db.qtTaskGroup.findMany({
        where: { projectId: params.id, isDeleted: false },
        orderBy: [{ isDefault: "desc" }, { order: "asc" }, { createdAt: "asc" }],
      }),
      db.qtIssueStatus.findMany({
        where: { projectId: params.id, isDeleted: false },
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          name: true,
          color: true,
          category: true,
          orderIndex: true,
        },
      }),
      sprintIdsToFilter.length === 0
        ? Promise.resolve(
            [] as Array<{
              id: string;
              key: string;
              title: string;
              type: string;
              priority: string;
              statusId: string;
              sprintId: string | null;
              assigneeId: string | null;
              reporterId: string | null;
              groupId: string | null;
              orderInGroup: number;
              startDate: Date | null;
              dueDate: Date | null;
              storyPoints: number | null;
              eta: number | null;
              updatedAt: Date;
            }>,
          )
        : db.qtIssue.findMany({
        where: {
          projectId: params.id,
          orgId,
          isDeleted: false,
          type: { notIn: ["EPIC", "SUBTASK"] },
          sprintId: { in: sprintIdsToFilter },
          ...(assigneeId === "null"
            ? { assigneeId: null }
            : assigneeId
              ? { assigneeId }
              : {}),
          ...(priority ? { priority } : {}),
          ...(type ? { type } : {}),
          ...(search
            ? {
                OR: [
                  { title: { contains: search, mode: "insensitive" as const } },
                  { key: { contains: search, mode: "insensitive" as const } },
                ],
              }
            : {}),
        },
        orderBy: [{ orderInGroup: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          key: true,
          title: true,
          type: true,
          priority: true,
          statusId: true,
          sprintId: true,
          assigneeId: true,
          reporterId: true,
          groupId: true,
          orderInGroup: true,
          startDate: true,
          dueDate: true,
          storyPoints: true,
          eta: true,
          updatedAt: true,
        },
      }),
    ]);

    const buckets = new Map<string, typeof issues>();
    for (const g of groups) buckets.set(g.id, []);
    for (const t of issues) {
      const key = t.groupId ?? defaultGroup.id;
      const list = buckets.get(key);
      if (list) list.push(t);
      else buckets.set(key, [t]);
    }

    return NextResponse.json({
      success: true,
      data: {
        projectId: params.id,
        defaultGroupId: defaultGroup.id,
        statuses,
        groups: groups.map((g) => ({
          id: g.id,
          name: g.name,
          color: g.color,
          icon: g.icon,
          order: g.order,
          isDefault: g.isDefault,
          isCollapsed: g.isCollapsed,
          tasks: buckets.get(g.id) ?? [],
          taskCount: (buckets.get(g.id) ?? []).length,
        })),
      },
    });
  },
);

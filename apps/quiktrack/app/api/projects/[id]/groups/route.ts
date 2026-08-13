import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { canWriteGroups, loadProjectAccess } from "@/lib/api/withProjectAccess";
import { createGroupSchema } from "@/lib/validation/group";
import { ensureDefaultGroup, nextGroupOrder } from "@/lib/services/groupService";

export const GET = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const access = await loadProjectAccess(orgId, userId, params.id);
    if (!access) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 },
      );
    }
    // params.id may be a projectKey; loadProjectAccess resolved it to the cuid.
    const projectId = access.projectId;
    await ensureDefaultGroup(orgId, projectId, userId);

    const groups = await db.qtTaskGroup.findMany({
      where: { projectId, isDeleted: false },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });

    const counts = await db.qtIssue.groupBy({
      by: ["groupId"],
      where: {
        projectId,
        isDeleted: false,
        type: { notIn: ["EPIC", "SUBTASK"] },
      },
      _count: { _all: true },
    });
    const countMap = new Map<string | null, number>();
    for (const c of counts) countMap.set(c.groupId, c._count._all);

    return NextResponse.json({
      success: true,
      data: groups.map((g) => ({
        ...g,
        taskCount:
          (g.isDefault ? countMap.get(null) ?? 0 : 0) + (countMap.get(g.id) ?? 0),
      })),
    });
  },
);

export const POST = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const access = await loadProjectAccess(orgId, userId, params.id);
    if (!access) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 },
      );
    }
    if (!(await canWriteGroups(access, userId, orgId))) {
      return NextResponse.json(
        { success: false, error: "You don't have access to this." },
        { status: 403 },
      );
    }
    // params.id may be a projectKey; loadProjectAccess resolved it to the cuid.
    const projectId = access.projectId;
    const parsed = createGroupSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.issues.map((i) => i.message).join(", "),
        },
        { status: 400 },
      );
    }
    await ensureDefaultGroup(orgId, projectId, userId);
    const order = await nextGroupOrder(projectId);
    try {
      const group = await db.qtTaskGroup.create({
        data: {
          orgId,
          projectId,
          name: parsed.data.name.trim(),
          color: parsed.data.color ?? "#94a3b8",
          icon: parsed.data.icon ?? null,
          order,
          createdBy: userId,
          updatedBy: userId,
        },
      });
      return NextResponse.json({ success: true, data: group }, { status: 201 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Unique constraint")) {
        return NextResponse.json(
          { success: false, error: "A group with that name already exists" },
          { status: 409 },
        );
      }
      throw error;
    }
  },
);

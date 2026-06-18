import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { canWriteGroups, loadProjectAccess } from "@/lib/api/withProjectAccess";
import { updateGroupSchema } from "@/lib/validation/group";
import { softDeleteGroup } from "@/lib/services/groupService";

export const PATCH = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, req, { params }) => {
    const group = await db.qtTaskGroup.findFirst({
      where: { id: params.id, orgId, isDeleted: false },
      select: { id: true, projectId: true, isDefault: true },
    });
    if (!group) {
      return NextResponse.json(
        { success: false, error: "Group not found" },
        { status: 404 },
      );
    }
    const access = await loadProjectAccess(orgId, userId, group.projectId);
    if (!access || !(await canWriteGroups(access, userId, orgId))) {
      return NextResponse.json(
        { success: false, error: "You don't have access to this." },
        { status: 403 },
      );
    }
    const parsed = updateGroupSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.issues.map((i) => i.message).join(", "),
        },
        { status: 400 },
      );
    }
    try {
      const updated = await db.qtTaskGroup.update({
        where: { id: params.id },
        data: {
          ...(parsed.data.name !== undefined ? { name: parsed.data.name.trim() } : {}),
          ...(parsed.data.color !== undefined ? { color: parsed.data.color } : {}),
          ...(parsed.data.icon !== undefined ? { icon: parsed.data.icon } : {}),
          ...(parsed.data.isCollapsed !== undefined
            ? { isCollapsed: parsed.data.isCollapsed }
            : {}),
          updatedBy: userId,
        },
      });
      return NextResponse.json({ success: true, data: updated });
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

export const DELETE = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const group = await db.qtTaskGroup.findFirst({
      where: { id: params.id, orgId, isDeleted: false },
      select: { id: true, projectId: true, isDefault: true },
    });
    if (!group) {
      return NextResponse.json(
        { success: false, error: "Group not found" },
        { status: 404 },
      );
    }
    if (group.isDefault) {
      return NextResponse.json(
        { success: false, error: "The default Ungrouped group cannot be deleted" },
        { status: 400 },
      );
    }
    const access = await loadProjectAccess(orgId, userId, group.projectId);
    if (!access || !(await canWriteGroups(access, userId, orgId))) {
      return NextResponse.json(
        { success: false, error: "You don't have access to this." },
        { status: 403 },
      );
    }
    await softDeleteGroup({
      orgId,
      projectId: group.projectId,
      groupId: params.id,
      userId,
    });
    return NextResponse.json({ success: true, data: { id: params.id } });
  },
);

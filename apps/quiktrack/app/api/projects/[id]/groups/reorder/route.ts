import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { canWriteGroups, loadProjectAccess } from "@/lib/api/withProjectAccess";
import { reorderGroupsSchema } from "@/lib/validation/group";
import { reorderGroups } from "@/lib/services/groupService";

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
    const parsed = reorderGroupsSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.issues.map((i) => i.message).join(", "),
        },
        { status: 400 },
      );
    }
    const { orderedIds } = parsed.data;

    const existing = await db.qtTaskGroup.findMany({
      where: { projectId, isDeleted: false, id: { in: orderedIds } },
      select: { id: true },
    });
    if (existing.length !== orderedIds.length) {
      return NextResponse.json(
        { success: false, error: "Some groups do not belong to this project" },
        { status: 400 },
      );
    }
    await reorderGroups(projectId, orderedIds);
    return NextResponse.json({ success: true, data: { orderedIds } });
  },
);

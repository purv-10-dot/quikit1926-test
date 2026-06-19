import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";
import { updateMemberSchema } from "@/lib/validation/member";

export const PATCH = withProjectAccess<{ id: string; userId: string }>(
  async ({ projectId }, req, { params }) => {
    const parsed = updateMemberSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }

    const member = await db.qtProjectMember.update({
      where: { projectId_userId: { projectId, userId: params.userId } },
      data: { role: parsed.data.role },
    });
    return NextResponse.json({ success: true, data: member });
  },
  { paramKey: "id", requirePermission: { resource: "ProjectMember", action: "update" } },
);

export const DELETE = withProjectAccess<{ id: string; userId: string }>(
  async ({ projectId }, _req, { params }) => {
    await db.qtProjectMember.update({
      where: { projectId_userId: { projectId, userId: params.userId } },
      data: { isDeleted: true },
    });
    return NextResponse.json({ success: true, data: { userId: params.userId } });
  },
  { paramKey: "id", requirePermission: { resource: "ProjectMember", action: "delete" } },
);

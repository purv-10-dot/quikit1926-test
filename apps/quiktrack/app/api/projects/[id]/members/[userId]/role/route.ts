import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";

const bodySchema = z.object({
  /** QtProjectRole.id, or null to clear. */
  projectRoleId: z.string().min(1).nullable(),
});

// PATCH /api/projects/[id]/members/[userId]/role
// Assign / clear a project member's dynamic project role. Writes to the
// QtProjectUserRole join table — QtProjectMember itself only carries
// membership presence + the legacy enum.
export const PATCH = withProjectAccess<{ id: string; userId: string }>(async (
  { projectId, projectRole, isTenantAdmin, userId: actorId },
  req,
  { params },
) => {
  if (!isTenantAdmin && projectRole !== "PROJECT_ADMIN") {
    return NextResponse.json({ success: false, error: "Project admin required" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const member = await db.qtProjectMember.findFirst({
    where: { projectId, userId: params.userId, isDeleted: false },
    select: { id: true },
  });
  if (!member) {
    return NextResponse.json({ success: false, error: "Member not found" }, { status: 404 });
  }

  // Clear path
  if (!parsed.data.projectRoleId) {
    await db.qtProjectUserRole.deleteMany({
      where: { projectId, userId: params.userId },
    });
    return NextResponse.json({
      success: true,
      data: { userId: params.userId, projectRoleId: null },
    });
  }

  // Assign path — validate role belongs to this project
  const role = await db.qtProjectRole.findFirst({
    where: { id: parsed.data.projectRoleId, projectId },
    select: { id: true },
  });
  if (!role) {
    return NextResponse.json({ success: false, error: "Role not found in this project" }, { status: 404 });
  }

  // Upsert into QtProjectUserRole (one project role per user per project).
  await db.$transaction([
    db.qtProjectUserRole.deleteMany({ where: { projectId, userId: params.userId } }),
    db.qtProjectUserRole.create({
      data: {
        projectId,
        userId: params.userId,
        projectRoleId: role.id,
        assignedBy: actorId,
      },
    }),
  ]);

  return NextResponse.json({
    success: true,
    data: { userId: params.userId, projectRoleId: role.id },
  });
}, { paramKey: "id" });

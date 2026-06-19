import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess, userCanInProject, forbidden } from "@/lib/api/permissions";

const bodySchema = z.object({
  projectId: z.string().min(1),
  ids: z.array(z.string().min(1)).min(1).max(500),
});

/**
 * Soft-deletes a batch of issues. Caller must be a member of the project (or
 * a tenant admin/owner). All ids must belong to the same project + tenant —
 * any id outside that scope is silently dropped from the count, never deleted.
 */
export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }

  const project = await db.qtProject.findFirst({
    where: { id: parsed.data.projectId, orgId: orgId, isDeleted: false },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
  }

  const isAdmin = await hasAdminAccess(userId, orgId);
  if (!isAdmin) {
    const member = await db.qtProjectMember.findFirst({
      where: { projectId: project.id, userId, isDeleted: false },
      select: { id: true },
    });
    if (!member) {
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }
    // Same gate as single delete (DELETE /api/issues/[id]) — membership alone
    // is not enough; the role must grant Issue:delete in this project.
    if (!(await userCanInProject(userId, orgId, project.id, "Issue", "delete"))) {
      return forbidden();
    }
  }

  const result = await db.qtIssue.updateMany({
    where: {
      id: { in: parsed.data.ids },
      orgId: orgId,
      projectId: project.id,
      isDeleted: false,
    },
    data: { isDeleted: true, updatedBy: userId },
  });

  return NextResponse.json({ success: true, deleted: result.count });
});

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess, userCanInProject } from "@/lib/api/permissions";

const bodySchema = z.object({
  projectId: z.string().min(1),
  ids: z.array(z.string().min(1)).min(1).max(500),
});

/**
 * Soft-deletes a batch of issues. Caller must be a member of the project (or a
 * tenant admin/owner). Permission mirrors single delete (DELETE /api/issues/[id]):
 *   - a full `Issue:delete` grant (Space Admin / admins) deletes ANY selected
 *     issue in the project;
 *   - otherwise a member deletes only issues they OWN (reported or created) —
 *     selected issues owned by others are skipped, never deleted.
 * Returns `{ deleted, skipped }` so the UI can report what was left out.
 * Ids outside this project/tenant are silently dropped (counted as neither).
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

  let canDeleteAny = await hasAdminAccess(userId, orgId);
  if (!canDeleteAny) {
    const member = await db.qtProjectMember.findFirst({
      where: { projectId: project.id, userId, isDeleted: false },
      select: { id: true },
    });
    if (!member) {
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }
    // Full delete grant → may delete any issue here; otherwise own-only below.
    canDeleteAny = await userCanInProject(userId, orgId, project.id, "Issue", "delete");
  }

  // Resolve which selected ids actually belong to this project (+ ownership).
  const inScope = await db.qtIssue.findMany({
    where: { id: { in: parsed.data.ids }, orgId, projectId: project.id, isDeleted: false },
    select: { id: true, reporterId: true, createdBy: true },
  });
  const deletableIds = canDeleteAny
    ? inScope.map((i) => i.id)
    : inScope
        .filter((i) => i.reporterId === userId || i.createdBy === userId)
        .map((i) => i.id);
  const skipped = inScope.length - deletableIds.length;

  let deleted = 0;
  if (deletableIds.length > 0) {
    deleted = await db.$transaction(async (tx) => {
      // Detach children so nothing is orphaned or silently cascade-deleted:
      // subtasks of a deleted parent become standalone (parentId → null), and
      // epic children lose their epic link (epicId → null). Mirrors the
      // single-delete "detach" behavior.
      await tx.qtIssue.updateMany({
        where: { parentId: { in: deletableIds }, orgId, isDeleted: false },
        data: { parentId: null, updatedBy: userId },
      });
      await tx.qtIssue.updateMany({
        where: { epicId: { in: deletableIds }, orgId, isDeleted: false },
        data: { epicId: null, updatedBy: userId },
      });
      const result = await tx.qtIssue.updateMany({
        where: { id: { in: deletableIds }, orgId, projectId: project.id, isDeleted: false },
        data: { isDeleted: true, updatedBy: userId },
      });
      return result.count;
    });
  }

  return NextResponse.json({ success: true, deleted, skipped });
});

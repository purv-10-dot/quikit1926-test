import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";
import { userCanInProject } from "@/lib/api/permissions";

/**
 * Edit / delete a comment on an idea. PATCH edits the body (owner only). DELETE
 * is a soft delete (isDeleted) so threads stay intact: any Contributor
 * (Idea:update) may delete their OWN comment; deleting someone else's requires
 * Idea:delete (Space Admin). Global admins bypass via the guard.
 */

const editSchema = z.object({ body: z.string().min(1, "Comment can't be empty").max(20000) });

export const PATCH = withProjectAccess<{ id: string; ideaId: string; commentId: string }>(
  async ({ orgId, userId, projectId }, req, { params }) => {
    const parsed = editSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    const comment = await db.qtIdeaComment.findFirst({
      where: { id: params.commentId, orgId, ideaId: params.ideaId, isDeleted: false, idea: { projectId } },
      select: { id: true, createdBy: true },
    });
    if (!comment) {
      return NextResponse.json({ success: false, error: "Comment not found" }, { status: 404 });
    }
    if (comment.createdBy !== userId) {
      return NextResponse.json({ success: false, error: "You can only edit your own comment" }, { status: 403 });
    }
    const updated = await db.qtIdeaComment.update({
      where: { id: params.commentId },
      data: { body: parsed.data.body },
      select: { id: true, body: true, updatedAt: true },
    });
    return NextResponse.json({ success: true, data: updated });
  },
  { paramKey: "id", requirePermission: { resource: "Idea", action: "update" } },
);

export const DELETE = withProjectAccess<{ id: string; ideaId: string; commentId: string }>(
  async ({ orgId, userId, projectId, isTenantAdmin }, _req, { params }) => {
    const comment = await db.qtIdeaComment.findFirst({
      where: { id: params.commentId, orgId, ideaId: params.ideaId, isDeleted: false },
      select: { id: true, createdBy: true, idea: { select: { projectId: true } } },
    });
    if (!comment || comment.idea.projectId !== projectId) {
      return NextResponse.json({ success: false, error: "Comment not found" }, { status: 404 });
    }

    const isOwner = comment.createdBy === userId;
    const canDeleteOthers =
      isTenantAdmin || (await userCanInProject(userId, orgId, projectId, "Idea", "delete"));
    if (!isOwner && !canDeleteOthers) {
      return NextResponse.json({ success: false, error: "Not allowed to delete this comment" }, { status: 403 });
    }

    await db.qtIdeaComment.update({ where: { id: params.commentId }, data: { isDeleted: true } });
    return NextResponse.json({ success: true, data: { id: params.commentId } });
  },
  { paramKey: "id", requirePermission: { resource: "Idea", action: "update" } },
);

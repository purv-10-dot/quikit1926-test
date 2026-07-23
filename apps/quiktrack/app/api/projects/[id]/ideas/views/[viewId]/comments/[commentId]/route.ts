import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";

/**
 * Edit / delete a view-level comment. PATCH edits the body (author only). DELETE
 * soft-deletes (author, or a Space/tenant admin). Gated on IdeaView:view.
 */

const editSchema = z.object({ body: z.string().min(1, "Comment can't be empty").max(20000) });

async function loadComment(orgId: string, projectId: string, viewId: string, commentId: string) {
  const view = await db.qtIdeaView.findFirst({ where: { id: viewId, orgId, projectId, isDeleted: false }, select: { id: true } });
  if (!view) return null;
  return db.qtIdeaViewComment.findFirst({
    where: { id: commentId, orgId, viewId, isDeleted: false },
    select: { id: true, createdBy: true },
  });
}

export const PATCH = withProjectAccess<{ id: string; viewId: string; commentId: string }>(
  async ({ orgId, userId, projectId }, req, { params }) => {
    const parsed = editSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    const comment = await loadComment(orgId, projectId, params.viewId, params.commentId);
    if (!comment) return NextResponse.json({ success: false, error: "Comment not found" }, { status: 404 });
    if (comment.createdBy !== userId) {
      return NextResponse.json({ success: false, error: "You can only edit your own comment" }, { status: 403 });
    }
    const updated = await db.qtIdeaViewComment.update({
      where: { id: params.commentId },
      data: { body: parsed.data.body },
      select: { id: true, body: true, updatedAt: true },
    });
    return NextResponse.json({ success: true, data: updated });
  },
  { paramKey: "id", requirePermission: { resource: "IdeaView", action: "view" } },
);

export const DELETE = withProjectAccess<{ id: string; viewId: string; commentId: string }>(
  async ({ orgId, userId, projectId, isTenantAdmin }, _req, { params }) => {
    const comment = await loadComment(orgId, projectId, params.viewId, params.commentId);
    if (!comment) return NextResponse.json({ success: false, error: "Comment not found" }, { status: 404 });
    if (comment.createdBy !== userId && !isTenantAdmin) {
      return NextResponse.json({ success: false, error: "Not allowed to delete this comment" }, { status: 403 });
    }
    await db.qtIdeaViewComment.update({ where: { id: params.commentId }, data: { isDeleted: true } });
    return NextResponse.json({ success: true, data: { id: params.commentId } });
  },
  { paramKey: "id", requirePermission: { resource: "IdeaView", action: "view" } },
);

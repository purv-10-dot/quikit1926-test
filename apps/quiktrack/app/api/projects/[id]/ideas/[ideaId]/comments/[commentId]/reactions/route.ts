import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";

/**
 * Toggle an emoji reaction on an idea comment. POST { emoji } adds the reaction
 * for the current user, or removes it if they'd already reacted with that emoji
 * (idempotent toggle). Reacting is membership-based, gated on IdeaView:view.
 */

const reactionSchema = z.object({ emoji: z.string().min(1).max(16) });

export const POST = withProjectAccess<{ id: string; ideaId: string; commentId: string }>(
  async ({ orgId, userId, projectId }, req, { params }) => {
    const parsed = reactionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid emoji" }, { status: 400 });
    }

    // Confirm the comment belongs to this idea+project (no cross-idea reactions).
    const comment = await db.qtIdeaComment.findFirst({
      where: { id: params.commentId, orgId, ideaId: params.ideaId, isDeleted: false, idea: { projectId } },
      select: { id: true },
    });
    if (!comment) {
      return NextResponse.json({ success: false, error: "Comment not found" }, { status: 404 });
    }

    const emoji = parsed.data.emoji;
    const existing = await db.qtIdeaCommentReaction.findUnique({
      where: { commentId_userId_emoji: { commentId: params.commentId, userId, emoji } },
      select: { id: true },
    });

    if (existing) {
      await db.qtIdeaCommentReaction.delete({ where: { id: existing.id } });
      return NextResponse.json({ success: true, data: { emoji, reacted: false } });
    }
    await db.qtIdeaCommentReaction.create({
      data: { orgId, commentId: params.commentId, userId, emoji },
    });
    return NextResponse.json({ success: true, data: { emoji, reacted: true } }, { status: 201 });
  },
  { paramKey: "id", requirePermission: { resource: "IdeaView", action: "view" } },
);

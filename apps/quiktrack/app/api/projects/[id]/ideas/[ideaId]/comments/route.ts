import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";

/**
 * Comments on an idea (JPD "Comments" tab). GET lists them (threaded via
 * parentId), POST adds one. Reading is membership-gated (IdeaView:view);
 * posting reuses Idea:update (Contributors can comment, matching the funnel).
 */

const createCommentSchema = z.object({
  body: z.string().min(1, "Comment can't be empty").max(20000),
  parentId: z.string().min(1).nullable().optional(),
});

async function ideaExists(orgId: string, projectId: string, ideaId: string) {
  return db.qtIdea.findFirst({
    where: { id: ideaId, orgId, projectId, isDeleted: false },
    select: { id: true },
  });
}

export const GET = withProjectAccess<{ id: string; ideaId: string }>(
  async ({ orgId, userId, projectId }, _req, { params }) => {
    if (!(await ideaExists(orgId, projectId, params.ideaId))) {
      return NextResponse.json({ success: false, error: "Idea not found" }, { status: 404 });
    }
    const comments = await db.qtIdeaComment.findMany({
      where: { orgId, ideaId: params.ideaId, isDeleted: false },
      orderBy: { createdAt: "asc" },
      select: { id: true, body: true, parentId: true, createdBy: true, createdAt: true, updatedAt: true },
    });

    // Reactions fetched in a separate query (keyed by commentId) rather than a
    // nested relation include — avoids coupling to the QtIdeaComment.reactions
    // relation in the generated client.
    const commentIds = comments.map((c) => c.id);
    const reactions = commentIds.length
      ? await db.qtIdeaCommentReaction.findMany({
          where: { commentId: { in: commentIds } },
          select: { commentId: true, emoji: true, userId: true },
        })
      : [];
    const reactionsByComment = new Map<string, { emoji: string; userId: string }[]>();
    for (const r of reactions) {
      const arr = reactionsByComment.get(r.commentId) ?? [];
      arr.push({ emoji: r.emoji, userId: r.userId });
      reactionsByComment.set(r.commentId, arr);
    }

    // Resolve author display names in one query (createdBy → user).
    const authorIds = [...new Set(comments.map((c) => c.createdBy).filter((v): v is string => Boolean(v)))];
    const users = authorIds.length
      ? await db.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, firstName: true, lastName: true, email: true } })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    const data = comments.map((c) => {
      const u = c.createdBy ? byId.get(c.createdBy) : null;
      const name = u ? [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email : "Unknown";
      // Aggregate reactions → [{ emoji, count, mine }] for this viewer.
      const agg = new Map<string, { emoji: string; count: number; mine: boolean }>();
      for (const r of reactionsByComment.get(c.id) ?? []) {
        const cur = agg.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false };
        cur.count += 1;
        if (r.userId === userId) cur.mine = true;
        agg.set(r.emoji, cur);
      }
      return { ...c, authorName: name, reactions: [...agg.values()] };
    });

    return NextResponse.json({ success: true, data });
  },
  { paramKey: "id", requirePermission: { resource: "IdeaView", action: "view" } },
);

export const POST = withProjectAccess<{ id: string; ideaId: string }>(
  async ({ orgId, userId, projectId }, req, { params }) => {
    const parsed = createCommentSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    if (!(await ideaExists(orgId, projectId, params.ideaId))) {
      return NextResponse.json({ success: false, error: "Idea not found" }, { status: 404 });
    }

    // A reply must target a comment on the SAME idea (prevents cross-idea threads).
    if (parsed.data.parentId) {
      const parent = await db.qtIdeaComment.findFirst({
        where: { id: parsed.data.parentId, orgId, ideaId: params.ideaId, isDeleted: false },
        select: { id: true },
      });
      if (!parent) {
        return NextResponse.json({ success: false, error: "Parent comment not found" }, { status: 400 });
      }
    }

    try {
      const comment = await db.qtIdeaComment.create({
        data: {
          orgId,
          ideaId: params.ideaId,
          parentId: parsed.data.parentId ?? null,
          body: parsed.data.body,
          createdBy: userId,
        },
        select: { id: true, body: true, parentId: true, createdBy: true, createdAt: true, updatedAt: true },
      });
      return NextResponse.json({ success: true, data: comment }, { status: 201 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to add comment";
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }
  },
  { paramKey: "id", requirePermission: { resource: "Idea", action: "update" } },
);

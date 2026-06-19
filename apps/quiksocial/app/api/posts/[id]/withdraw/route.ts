/**
 * PATCH /api/posts/[id]/withdraw
 *
 * Member-only. Pulls a post out of admin review back to draft.
 *
 * - Caller must own the post
 * - Post must be in "review" status
 * - Clears requestedPublishTime; rejectionNote intact for context.
 *
 * Ported to QuikIT (Phase 3, Batch 2).
 */

import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { PostStatus } from "@/types/post-status";

type AnyRow = Record<string, unknown>;

function aliasPost<T extends AnyRow>(
  p: T,
): T & { _id: unknown; userId: unknown } {
  return { ...p, _id: p.id, userId: p.createdBy ?? null };
}

export const PATCH = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const post = await db.post.findFirst({
      where: { id: params.id, orgId },
      select: { id: true, status: true, createdBy: true },
    });
    if (!post) {
      return NextResponse.json(
        { success: false, error: "Post not found", code: "POST_NOT_FOUND" },
        { status: 404 },
      );
    }

    if (post.createdBy !== userId) {
      return NextResponse.json(
        {
          success: false,
          error: "You can only withdraw your own posts",
          code: "NOT_POST_OWNER",
        },
        { status: 403 },
      );
    }

    if (post.status !== PostStatus.Review) {
      return NextResponse.json(
        {
          success: false,
          error: `Post cannot be withdrawn from status "${post.status}"`,
          code: "INVALID_STATUS_TRANSITION",
        },
        { status: 422 },
      );
    }

    const updated = await db.post.update({
      where: { id: params.id },
      data: {
        status: PostStatus.Draft,
        requestedPublishTime: null,
        updatedBy: userId,
      },
    });

    return NextResponse.json({
      success: true,
      data: { post: aliasPost(updated) },
    });
  },
);

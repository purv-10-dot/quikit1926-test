/**
 * PATCH /api/posts/[id]/reject
 *
 * Admin-only. Sends a post back to "draft" with a rejection note.
 * "rejected" is NOT a permanent status — the post returns to "draft"
 * so the member can fix and resubmit.
 *
 * Body: { rejectionNote?: string }
 *
 * Ported to QuikIT (Phase 3, Batch 2).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { isAdminInBrand } from "@/lib/auth/rbac";
import { PostStatus, REJECTABLE_STATUSES } from "@/types/post-status";

type AnyRow = Record<string, unknown>;

function aliasPost<T extends AnyRow>(
  p: T,
): T & { _id: unknown; userId: unknown } {
  return { ...p, _id: p.id, userId: p.createdBy ?? null };
}

const rejectSchema = z.object({ rejectionNote: z.string().optional() });

export const PATCH = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, req: NextRequest, { params }) => {
    const json = await req.json().catch(() => ({}));
    // rejectionNote is optional — empty body allowed.
    const body = rejectSchema.parse(json ?? {});

    const post = await db.post.findFirst({
      where: { id: params.id, orgId },
      select: { id: true, brandId: true, status: true },
    });
    if (!post) {
      return NextResponse.json(
        { success: false, error: "Post not found", code: "POST_NOT_FOUND" },
        { status: 404 },
      );
    }

    const admin = await isAdminInBrand(orgId, userId, post.brandId);
    if (!admin) {
      return NextResponse.json(
        {
          success: false,
          error: "Only admins can reject posts",
          code: "INSUFFICIENT_ROLE",
        },
        { status: 403 },
      );
    }

    if (!REJECTABLE_STATUSES.includes(post.status as PostStatus)) {
      return NextResponse.json(
        {
          success: false,
          error: `Post cannot be rejected from status "${post.status}"`,
          code: "INVALID_STATUS_TRANSITION",
        },
        { status: 422 },
      );
    }

    const now = new Date();

    const updated = await db.post.update({
      where: { id: params.id },
      data: {
        status: PostStatus.Draft,
        rejectionNote: body.rejectionNote?.trim() || null,
        approvedAt: null,
        scheduledFor: null,
        requestedPublishTime: null,
        moderatedById: userId,
        moderatedAt: now,
        updatedBy: userId,
      },
    });

    return NextResponse.json({
      success: true,
      data: { post: aliasPost(updated) },
    });
  },
);

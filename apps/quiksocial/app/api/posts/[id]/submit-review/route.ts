/**
 * PATCH /api/posts/[id]/submit-review
 *
 * Member-only. Submits a draft post for admin review.
 * Admin/approver cannot use this route — they have direct approve / schedule
 * access.
 *
 * Body (optional): { requestedPublishTime?: string (ISO date) }
 *
 * Ported to QuikIT (Phase 3, Batch 2).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { getUserTimezone, resolveScheduledForUtc } from "@/lib/utils/timezone";
import { getWorkspaceRole } from "@/lib/auth/rbac";
import { PostStatus } from "@/types/post-status";

type AnyRow = Record<string, unknown>;

function aliasPost<T extends AnyRow>(
  p: T,
): T & { _id: unknown; userId: unknown } {
  return { ...p, _id: p.id, userId: p.createdBy ?? null };
}

const submitReviewSchema = z.object({
  requestedPublishTime: z.string().nullish(),
});

export const PATCH = withOrgAuth<{ id: string }>(
  async ({ orgId, userId, session }, req: NextRequest, { params }) => {
    const json = await req.json().catch(() => ({}));
    const body = submitReviewSchema.parse(json ?? {});

    const post = await db.post.findFirst({
      where: { id: params.id, orgId },
      select: { id: true, brandId: true, status: true, createdBy: true },
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
          error: "You can only submit your own posts for review",
          code: "NOT_POST_OWNER",
        },
        { status: 403 },
      );
    }

    const role = await getWorkspaceRole(orgId, userId, post.brandId);
    if (role === "admin" || role === "approver") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Admins cannot submit posts for review — use approve or schedule directly",
          code: "ADMIN_CANNOT_SUBMIT_REVIEW",
        },
        { status: 403 },
      );
    }

    if (post.status !== PostStatus.Draft) {
      return NextResponse.json(
        {
          success: false,
          error: `Post is already in "${post.status}" status and cannot be submitted again`,
          code: "INVALID_STATUS_TRANSITION",
        },
        { status: 422 },
      );
    }

    const data: Record<string, unknown> = {
      status: PostStatus.Review,
      rejectionNote: null,
      updatedBy: userId,
    };

    if (body.requestedPublishTime !== undefined) {
      if (body.requestedPublishTime === null || body.requestedPublishTime === "") {
        data.requestedPublishTime = null;
      } else {
        // F2: tz-naive local wall-clock → UTC in the user's profile timezone.
        const t = resolveScheduledForUtc(
          body.requestedPublishTime,
          getUserTimezone(session),
        );
        if (!t) {
          return NextResponse.json(
            {
              success: false,
              error: "Invalid requestedPublishTime",
              code: "INVALID_BODY",
            },
            { status: 400 },
          );
        }
        data.requestedPublishTime = t;
      }
    }

    const updated = await db.post.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json({
      success: true,
      data: { post: aliasPost(updated) },
    });
  },
);

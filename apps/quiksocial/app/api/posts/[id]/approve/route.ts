/**
 * PATCH /api/posts/[id]/approve
 *
 * Admin-only. Approves a post in "review" status.
 *
 * - No scheduledFor set        → status becomes "approved"
 * - scheduledFor set, future   → status becomes "scheduled"
 * - scheduledFor set, past     → returns { requiresReschedule: true } — does NOT approve
 *
 * Ported to QuikIT (Phase 3, Batch 2).
 */

import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { isAdminInBrand } from "@/lib/auth/rbac";
import { PostStatus, APPROVABLE_STATUSES } from "@/types/post-status";

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
      select: { id: true, brandId: true, status: true, scheduledFor: true },
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
          error: "Only admins can approve posts",
          code: "INSUFFICIENT_ROLE",
        },
        { status: 403 },
      );
    }

    if (!APPROVABLE_STATUSES.includes(post.status as PostStatus)) {
      return NextResponse.json(
        {
          success: false,
          error: `Post cannot be approved from status "${post.status}"`,
          code: "INVALID_STATUS_TRANSITION",
        },
        { status: 422 },
      );
    }

    const now = new Date();

    if (post.scheduledFor && new Date(post.scheduledFor) < now) {
      return NextResponse.json({
        success: true,
        data: {
          requiresReschedule: true,
          scheduledFor: post.scheduledFor,
          code: "PAST_SCHEDULE_TIME",
        },
      });
    }

    const nextStatus =
      post.scheduledFor && new Date(post.scheduledFor) >= now
        ? PostStatus.Scheduled
        : PostStatus.Approved;

    const updated = await db.post.update({
      where: { id: params.id },
      data: {
        status: nextStatus,
        approvedAt: now,
        moderatedById: userId,
        moderatedAt: now,
        moderationNote: null,
        rejectionNote: null,
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

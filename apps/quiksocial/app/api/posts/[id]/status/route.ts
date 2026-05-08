/**
 * PATCH /api/posts/[id]/status
 *
 * General status update — used for scheduling, rescheduling, and other
 * transitions not covered by the specific approve/reject routes.
 *
 * Body: { status: PostStatus, scheduledFor?: string (ISO date) }
 *
 * RBAC:
 * - Admins update any post in their brand
 * - Members update only their own posts to allowed statuses (Draft only)
 *
 * Ported to QuikIT (Phase 3, Batch 2).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { getWorkspaceRole } from "@/lib/auth/rbac";
import { PostStatus } from "@/types/post-status";

const VALID_STATUSES = Object.values(PostStatus) as string[];
const MEMBER_ALLOWED_STATUSES: string[] = [PostStatus.Draft];

type AnyRow = Record<string, unknown>;

function aliasPost<T extends AnyRow>(
  p: T,
): T & { _id: unknown; userId: unknown } {
  return { ...p, _id: p.id, userId: p.createdBy ?? null };
}

const patchStatusSchema = z.object({
  status: z.string().min(1),
  scheduledFor: z.string().nullish(),
});

export const PATCH = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, req: NextRequest, { params }) => {
    const json = await req.json().catch(() => null);
    const parsed = patchStatusSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body", code: "INVALID_BODY" },
        { status: 400 },
      );
    }
    const body = parsed.data;

    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json(
        {
          success: false,
          error: `"${body.status}" is not a valid status. Allowed: ${VALID_STATUSES.join(", ")}`,
          code: "INVALID_STATUS",
        },
        { status: 422 },
      );
    }

    const post = await db.post.findFirst({
      where: { id: params.id, orgId },
      select: {
        id: true,
        brandId: true,
        createdBy: true,
        scheduledFor: true,
        approvedAt: true,
      },
    });
    if (!post) {
      return NextResponse.json(
        { success: false, error: "Post not found", code: "POST_NOT_FOUND" },
        { status: 404 },
      );
    }

    const role = await getWorkspaceRole(orgId, userId, post.brandId);
    if (!role) {
      return NextResponse.json(
        {
          success: false,
          error: "You do not have access to this brand",
          code: "NO_BRAND_ACCESS",
        },
        { status: 403 },
      );
    }
    const isAdmin = role === "admin";

    if (!isAdmin) {
      if (post.createdBy !== userId) {
        return NextResponse.json(
          {
            success: false,
            error: "You can only update your own posts",
            code: "NOT_POST_OWNER",
          },
          { status: 403 },
        );
      }
      if (!MEMBER_ALLOWED_STATUSES.includes(body.status)) {
        return NextResponse.json(
          {
            success: false,
            error: `Members cannot set status to "${body.status}"`,
            code: "INSUFFICIENT_ROLE",
          },
          { status: 403 },
        );
      }
    }

    const data: Record<string, unknown> = {
      status: body.status,
      updatedBy: userId,
    };

    if (body.scheduledFor !== undefined) {
      data.scheduledFor = body.scheduledFor ? new Date(body.scheduledFor) : null;
    }

    if (
      body.status === PostStatus.Scheduled &&
      !("scheduledFor" in data && data.scheduledFor) &&
      !post.scheduledFor
    ) {
      return NextResponse.json(
        {
          success: false,
          error: '"scheduledFor" is required when setting status to "scheduled"',
          code: "MISSING_SCHEDULED_FOR",
        },
        { status: 422 },
      );
    }

    // Admin schedules bypass /approve. Auto-stamp approvedAt so downstream
    // consumers treat an admin-scheduled post as approved. Don't overwrite
    // an existing value — preserves the original approval timestamp on
    // reschedule.
    if (body.status === PostStatus.Scheduled && !post.approvedAt) {
      data.approvedAt = new Date();
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

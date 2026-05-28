/**
 * POST /api/posts/[id]/publish-now
 *
 * Admin-only "Post Now" override. Publishes immediately, bypassing the
 * cron's atomic-lock + scheduledFor + approvedAt gates.
 *
 * Allowed source statuses: draft, approved, scheduled, failed, overdue.
 * Disallowed: review (must approve first), published (already live).
 *
 * Ported to QuikIT (Phase 3, Batch 2).
 */

import { NextRequest, NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { isAdminInBrand } from "@/lib/auth/rbac";
import { PostStatus } from "@/types/post-status";
import { publishPost } from "@/lib/meta/dispatch";

const ALLOWED_SOURCE_STATUSES: string[] = [
  PostStatus.Draft,
  PostStatus.Approved,
  PostStatus.Scheduled,
  PostStatus.Failed,
  PostStatus.Overdue,
];

type AnyRow = Record<string, unknown>;

function aliasPost<T extends AnyRow>(
  p: T,
): T & { _id: unknown; userId: unknown } {
  return { ...p, _id: p.id, userId: p.createdBy ?? null };
}

export const POST = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, req: NextRequest, { params }) => {
    const post = await db.post.findFirst({
      where: { id: params.id, orgId },
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
          error: "Only admins can publish immediately",
          code: "INSUFFICIENT_ROLE",
        },
        { status: 403 },
      );
    }

    if (!ALLOWED_SOURCE_STATUSES.includes(post.status)) {
      return NextResponse.json(
        {
          success: false,
          error: `Post cannot be published from status "${post.status}"`,
          code: "INVALID_STATUS_TRANSITION",
        },
        { status: 422 },
      );
    }

    // Optional platform override from the ScheduleModal "Post Now" pill —
    // user picks Facebook vs Instagram at publish time. Falls back to the
    // stored post.platform when missing or invalid.
    const body = (await req.json().catch(() => null)) as
      | { platform?: unknown }
      | null;
    const rawPlatform =
      typeof body?.platform === "string"
        ? body.platform.trim().toLowerCase()
        : null;
    const overridePlatform =
      rawPlatform === "facebook" || rawPlatform === "instagram" ? rawPlatform : null;

    const dispatch = await publishPost({
      orgId: post.orgId,
      brandId: post.brandId,
      userId: post.createdBy,
      platform: overridePlatform ?? post.platform,
      content: post.content,
      imageUrls: post.imageUrls,
      aiImageUrl: post.aiImageUrl,
    });

    if (dispatch.success && dispatch.mediaId) {
      const platformPostIds = {
        ...((post.platformPostIds as Record<string, string> | null) ?? {}),
        [dispatch.platform]: dispatch.mediaId,
      };
      const updated = await db.post.update({
        where: { id: params.id },
        data: {
          status: PostStatus.Published,
          // Persist the actual published-to platform (normalized by the
          // dispatcher) so the row matches reality, not the create default.
          platform: dispatch.platform,
          publishedAt: new Date(),
          publishedMediaId: dispatch.mediaId,
          permalink: dispatch.permalink ?? null,
          platformPostIds,
          failedReason: null,
          lockedAt: null,
          updatedBy: userId,
        },
      });

      return NextResponse.json({
        success: true,
        data: {
          post: aliasPost(updated),
          platform: dispatch.platform,
          mediaId: dispatch.mediaId,
          permalink: dispatch.permalink ?? null,
        },
      });
    }

    // Failure — persist reason so Content Hub can surface it on the Failed card.
    const reason = dispatch.error ?? "Publish failed for an unknown reason";
    const updated = await db.post.update({
      where: { id: params.id },
      data: {
        status: PostStatus.Failed,
        // Persist the attempted platform so a retry targets the same one.
        platform: dispatch.platform,
        failedReason: reason,
        lockedAt: null,
        updatedBy: userId,
      },
    });

    return NextResponse.json(
      {
        success: false,
        error: reason,
        data: {
          post: aliasPost(updated),
          platform: dispatch.platform,
          needsReconnect: dispatch.needsReconnect ?? false,
        },
      },
      { status: 502 },
    );
  },
);

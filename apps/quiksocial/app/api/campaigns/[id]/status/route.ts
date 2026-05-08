/**
 * GET /api/campaigns/[id]/status
 *
 * Authoritative source-of-truth for "is this campaign run finished?".
 * The Posts table is the truth; Campaign.generatedPosts and
 * Campaign.status are cached counters this endpoint self-heals lazily.
 *
 * Ported to QuikIT (Phase 3, Batch 2). Response shape includes the
 * legacy `_id` aliases on inner posts for frontend compat.
 */

import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";

export const GET = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const campaignId = params.id;

    const campaign = await db.campaign.findFirst({
      where: { id: campaignId, orgId },
    });
    if (!campaign) {
      return NextResponse.json(
        { success: false, error: "Campaign not found" },
        { status: 404 },
      );
    }
    if (campaign.createdBy !== userId) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    // Source of truth — the Post table. Campaign counters are caches.
    const posts = await db.post.findMany({
      where: { orgId, campaignId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        aiImageUrl: true,
        content: true,
        status: true,
      },
      take: 200,
    });

    const generatedPosts = posts.length;
    const totalPosts = campaign.totalPosts ?? 0;

    let nextStatus = campaign.status;
    const updates: Record<string, unknown> = {};

    if (campaign.generatedPosts !== generatedPosts) {
      updates.generatedPosts = generatedPosts;
    }

    if (
      totalPosts > 0 &&
      generatedPosts >= totalPosts &&
      campaign.status === "draft"
    ) {
      nextStatus = "active";
      updates.status = "active";
      updates.lastGeneratedAt = new Date();
    }

    if (Object.keys(updates).length > 0) {
      try {
        await db.campaign.update({
          where: { id: campaignId },
          data: updates,
        });
      } catch (err) {
        console.warn("[GET /api/campaigns/:id/status] cache write failed", err);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        campaignId: campaign.id,
        status: nextStatus,
        generatedPosts,
        totalPosts,
        posts: posts.map((p) => ({
          _id: p.id,
          imageUrl: p.aiImageUrl ?? null,
          caption: p.content ?? "",
          status: p.status,
        })),
      },
    });
  },
);

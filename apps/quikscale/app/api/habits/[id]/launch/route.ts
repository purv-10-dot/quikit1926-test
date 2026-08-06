import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { isOrgAdmin, forbidden } from "@/lib/api/permissions";
import { notifyHabitCampaign } from "@/lib/services/habitNotifications";

/**
 * POST /api/habits/[id]/launch  (admin only — system admin role)
 *
 * Flip a draft campaign to active and stamp publishedAt. Idempotent if the
 * campaign is already active. Closed/legacy campaigns can't be re-launched.
 */
export const POST = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    if (!(await isOrgAdmin(userId, orgId))) return forbidden();
    const existing = await db.habitAssessment.findFirst({
      where: { id: params.id, orgId },
      select: {
        id: true, status: true, isLegacy: true, publishedAt: true,
        quarter: true, year: true, deadline: true, participantUserIds: true,
      },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (existing.isLegacy) {
      return NextResponse.json(
        { success: false, error: "Legacy assessments cannot be launched" },
        { status: 400 },
      );
    }
    if (existing.status === "closed") {
      return NextResponse.json(
        { success: false, error: "Closed campaigns cannot be re-launched" },
        { status: 400 },
      );
    }
    if (existing.status === "active") {
      return NextResponse.json({ success: true, data: existing });
    }

    const updated = await db.habitAssessment.update({
      where: { id: params.id },
      data: { status: "active", publishedAt: new Date() },
    });

    // Awaited so a serverless freeze after the response can't drop the sends.
    // Swallowed so a mail failure never fails the launch itself.
    await notifyHabitCampaign({
      orgId,
      campaignId: updated.id,
      event: "launched",
      actorUserId: userId,
      quarter: existing.quarter,
      year: existing.year,
      deadline: existing.deadline,
      participantUserIds: existing.participantUserIds ?? [],
    }).catch((err) => {
      console.error("[POST /api/habits/[id]/launch] notifyHabitCampaign failed:", err);
    });

    return NextResponse.json({ success: true, data: updated });
  },
  { moduleKey: "habits", fallbackErrorMessage: "Failed to launch habit campaign" },
);

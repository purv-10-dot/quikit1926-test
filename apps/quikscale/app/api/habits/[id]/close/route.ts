import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { isOrgAdmin, forbidden } from "@/lib/api/permissions";
import { notifyHabitCampaign } from "@/lib/services/habitNotifications";

/**
 * POST /api/habits/[id]/close  (admin only — system admin role)
 *
 * Mark an active campaign as closed. Members can no longer submit / update
 * their response after this. Idempotent if already closed; rejects draft.
 */
export const POST = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    if (!(await isOrgAdmin(userId, orgId))) return forbidden();
    const existing = await db.habitAssessment.findFirst({
      where: { id: params.id, orgId },
      select: {
        id: true, status: true, isLegacy: true, closedAt: true,
        quarter: true, year: true, deadline: true, participantUserIds: true,
      },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    if (existing.isLegacy) {
      return NextResponse.json(
        { success: false, error: "Legacy assessments are already closed" },
        { status: 400 },
      );
    }
    if (existing.status === "draft") {
      return NextResponse.json(
        { success: false, error: "Launch the campaign before closing it" },
        { status: 400 },
      );
    }
    if (existing.status === "closed") {
      return NextResponse.json({ success: true, data: existing });
    }

    const updated = await db.habitAssessment.update({
      where: { id: params.id },
      data: { status: "closed", closedAt: new Date() },
    });
    await notifyHabitCampaign({
      orgId,
      campaignId: updated.id,
      event: "closed",
      actorUserId: userId,
      quarter: existing.quarter,
      year: existing.year,
      deadline: existing.deadline,
      participantUserIds: existing.participantUserIds ?? [],
    }).catch((err) => {
      console.error("[POST /api/habits/[id]/close] notifyHabitCampaign failed:", err);
    });

    return NextResponse.json({ success: true, data: updated });
  },
  { moduleKey: "habits", fallbackErrorMessage: "Failed to close habit campaign" },
);

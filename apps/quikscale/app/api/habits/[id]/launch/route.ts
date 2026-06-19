import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { isOrgAdmin, forbidden } from "@/lib/api/permissions";

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
      select: { id: true, status: true, isLegacy: true, publishedAt: true },
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
    return NextResponse.json({ success: true, data: updated });
  },
  { moduleKey: "habits", fallbackErrorMessage: "Failed to launch habit campaign" },
);

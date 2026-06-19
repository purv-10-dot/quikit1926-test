import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
const withOrgAuth = withOrgAuthForModule("analytics.individual");

export const GET = withOrgAuth<{ userId: string }>(async ({ orgId }, _req, { params }) => {
  const target = await db.user.findUnique({
    where: { id: params.userId },
    include: {
      kpisOwned: { where: { orgId }, include: { weeklyValues: true } },
      prioritiesOwned: { where: { orgId }, include: { weeklyStatuses: true } },
      memberships: { where: { orgId }, include: { team: true } },
      reviewsReceived: {
        where: { orgId },
        include: { reviewer: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!target) {
    return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
  }

  // Legacy team-meeting attendance removed in Client Meetings rewrite.
  const meetings: Array<{ attendees: Array<{ attended: boolean; userId: string }> }> = [];

  return NextResponse.json({ success: true, data: { user: target, meetings } });
});

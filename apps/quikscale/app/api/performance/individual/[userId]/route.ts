import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("analytics.individual");

export const GET = withTenantAuth<{ userId: string }>(async ({ tenantId }, _req, { params }) => {
  const target = await db.user.findUnique({
    where: { id: params.userId },
    include: {
      kpisOwned: { where: { tenantId }, include: { weeklyValues: true } },
      prioritiesOwned: { where: { tenantId }, include: { weeklyStatuses: true } },
      memberships: { where: { tenantId }, include: { team: true } },
      reviewsReceived: {
        where: { tenantId },
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

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

const withOrgAuth = withOrgAuthForModule("clientMeetings.weeklyMeeting");

/**
 * GET /api/client-meetings/weekly-meetings/[id]/audit — full Change History
 * timeline for one Weekly Meeting. Reads the centralized AuditEvent +
 * AuditChange tables, mirroring the other entities' audit routes.
 */
const MAX_EVENTS = 1000;

export const GET = withOrgAuth<{ id: string }>(
  async ({ orgId }, _request, { params }) => {
    const meeting = await db.clientWeeklyMeeting.findUnique({
      where: { id: params.id },
      select: { orgId: true },
    });
    if (!meeting || meeting.orgId !== orgId) {
      return NextResponse.json({ success: false, error: "Weekly meeting not found" }, { status: 404 });
    }

    const events = await db.auditEvent.findMany({
      where: { orgId, entityType: "WEEKLY_MEETING", entityId: params.id },
      select: {
        id: true,
        action: true,
        actorUserId: true,
        actorName: true,
        source: true,
        reason: true,
        snapshot: true,
        createdAt: true,
        teamId: true,
        changes: { select: { fieldName: true, oldValue: true, newValue: true } },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_EVENTS,
    });

    return NextResponse.json({
      success: true,
      data: events,
      meta: { total: events.length, capped: events.length === MAX_EVENTS },
    });
  },
  { fallbackErrorMessage: "Failed to fetch weekly meeting audit history" },
);

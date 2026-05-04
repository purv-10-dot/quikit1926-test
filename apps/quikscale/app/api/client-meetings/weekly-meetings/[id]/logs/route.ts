import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";

const withTenantAuth = withTenantAuthForModule("clientMeetings.weeklyMeeting");

/** GET /api/client-meetings/weekly-meetings/[id]/logs — audit trail */
export const GET = withTenantAuth<{ id: string }>(
  async ({ orgId }, _req, { params }) => {
    const meeting = await db.clientWeeklyMeeting.findFirst({
      where: { id: params.id, orgId },
      select: { id: true },
    });
    if (!meeting) {
      return NextResponse.json(
        { success: false, error: "Weekly meeting not found" },
        { status: 404 }
      );
    }

    const logs = await db.clientWeeklyMeetingLog.findMany({
      where: { meetingId: params.id },
      select: {
        id: true,
        action: true,
        oldValue: true,
        newValue: true,
        changedBy: true,
        reason: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const userIds = [...new Set(logs.map((l) => l.changedBy))];
    const users = userIds.length
      ? await db.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const userMap = Object.fromEntries(
      users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()])
    );

    return NextResponse.json({
      success: true,
      data: logs.map((l) => ({
        ...l,
        createdAt: l.createdAt.toISOString(),
        changedByName: userMap[l.changedBy] ?? l.changedBy,
      })),
    });
  }
);

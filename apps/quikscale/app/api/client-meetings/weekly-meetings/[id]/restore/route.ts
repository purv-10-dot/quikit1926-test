import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { writeAuditLog } from "@/lib/api/auditLog";

const withOrgAuth = withOrgAuthForModule("clientMeetings.weeklyMeeting");

/** POST /api/client-meetings/weekly-meetings/[id]/restore — undo soft delete. */
export const POST = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const existing = await db.clientWeeklyMeeting.findFirst({
    where: { id: params.id, orgId, deletedAt: { not: null } },
  });
  if (!existing) {
    return NextResponse.json(
      { success: false, error: "Weekly meeting not found in trash" },
      { status: 404 },
    );
  }
  await db.clientWeeklyMeeting.update({
    where: { id: params.id },
    data: { deletedAt: null, updatedBy: userId },
  });
  await db.clientWeeklyMeetingLog.create({
    data: {
      orgId,
      meetingId: params.id,
      action: "RESTORE",
      changedBy: userId,
    },
  });
  await writeAuditLog({
    orgId,
    actorId: userId,
    action: "RESTORE",
    entityType: "WeeklyMeeting",
    entityId: params.id,
  });
  return NextResponse.json({ success: true });
});

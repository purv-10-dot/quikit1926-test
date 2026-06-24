import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { writeAuditLog } from "@/lib/api/auditLog";
import { audit, requestContext } from "@/lib/audit";

const withOrgAuth = withOrgAuthForModule("clientMeetings.weeklyMeeting");

/** POST /api/client-meetings/weekly-meetings/[id]/restore — undo soft delete. */
export const POST = withOrgAuth<{ id: string }>(async ({ orgId, userId }, request, { params }) => {
  const existing = await db.clientWeeklyMeeting.findFirst({
    where: { id: params.id, orgId, deletedAt: { not: null } },
    include: { client: { select: { name: true } } },
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

  // ── Centralized audit (dual-write) ── RESTORE event for the timeline.
  await audit.log({
    entityType: "WEEKLY_MEETING",
    entityId: params.id,
    action: "RESTORE",
    actor: { userId, orgId, teamId: null },
    snapshot: { name: `${existing.client.name} · ${existing.meetingDate.toISOString().slice(0, 10)}` },
    ...requestContext(request),
  });

  return NextResponse.json({ success: true });
});

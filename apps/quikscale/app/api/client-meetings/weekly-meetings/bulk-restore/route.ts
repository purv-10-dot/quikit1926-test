import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { writeAuditLog } from "@/lib/api/auditLog";

const withOrgAuth = withOrgAuthForModule("clientMeetings.weeklyMeeting");

/** POST /api/client-meetings/weekly-meetings/bulk-restore — undo soft delete in bulk. */
export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids)
    ? body.ids.filter((x: unknown) => typeof x === "string")
    : [];
  if (ids.length === 0) {
    return NextResponse.json(
      { success: false, error: "No ids provided" },
      { status: 400 },
    );
  }
  const { count } = await db.clientWeeklyMeeting.updateMany({
    where: { id: { in: ids }, orgId, deletedAt: { not: null } },
    data: { deletedAt: null, updatedBy: userId },
  });
  await writeAuditLog({
    orgId,
    actorId: userId,
    action: "RESTORE",
    entityType: "WeeklyMeeting",
    entityId: ids.join(","),
    newValues: { count, ids },
  });
  return NextResponse.json({ success: true, data: { restored: count } });
});

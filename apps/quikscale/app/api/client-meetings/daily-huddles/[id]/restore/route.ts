import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { writeAuditLog } from "@/lib/api/auditLog";

const withOrgAuth = withOrgAuthForModule("clientMeetings.dailyHuddle");

/** POST /api/client-meetings/daily-huddles/[id]/restore — undo soft delete. */
export const POST = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const existing = await db.clientDailyHuddle.findFirst({ where: { id: params.id, orgId, deletedAt: { not: null } } });
  if (!existing) return NextResponse.json({ success: false, error: "Huddle not found in trash" }, { status: 404 });
  await db.clientDailyHuddle.update({ where: { id: params.id }, data: { deletedAt: null, updatedBy: userId } });
  await writeAuditLog({
    orgId, actorId: userId, action: "RESTORE",
    entityType: "DailyHuddle", entityId: params.id,
  });
  return NextResponse.json({ success: true });
});

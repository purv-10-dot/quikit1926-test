import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { writeAuditLog } from "@/lib/api/auditLog";

const withTenantAuth = withTenantAuthForModule("clientMeetings.dailyHuddle");

/** POST /api/client-meetings/daily-huddles/[id]/restore — undo soft delete. */
export const POST = withTenantAuth<{ id: string }>(async ({ tenantId, userId }, _req, { params }) => {
  const existing = await db.clientDailyHuddle.findFirst({ where: { id: params.id, tenantId, deletedAt: { not: null } } });
  if (!existing) return NextResponse.json({ success: false, error: "Huddle not found in trash" }, { status: 404 });
  await db.clientDailyHuddle.update({ where: { id: params.id }, data: { deletedAt: null, updatedBy: userId } });
  await writeAuditLog({
    tenantId, actorId: userId, action: "RESTORE",
    entityType: "DailyHuddle", entityId: params.id,
  });
  return NextResponse.json({ success: true });
});

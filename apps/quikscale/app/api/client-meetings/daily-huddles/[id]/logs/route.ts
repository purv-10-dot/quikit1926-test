import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";

const withTenantAuth = withTenantAuthForModule("clientMeetings.dailyHuddle");

/** GET /api/client-meetings/daily-huddles/[id]/logs — audit history. */
export const GET = withTenantAuth<{ id: string }>(async ({ tenantId }, _req, { params }) => {
  const exists = await db.clientDailyHuddle.findFirst({ where: { id: params.id, tenantId }, select: { id: true } });
  if (!exists) return NextResponse.json({ success: false, error: "Huddle not found" }, { status: 404 });

  const logs = await db.auditLog.findMany({
    where: { tenantId, entityType: "DailyHuddle", entityId: params.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, action: true, oldValues: true, newValues: true, actorId: true, reason: true, createdAt: true },
  });
  const userIds = [...new Set(logs.map(l => l.actorId))];
  const users = userIds.length
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } })
    : [];
  const nameMap = Object.fromEntries(users.map(u => [u.id, `${u.firstName} ${u.lastName}`.trim()]));

  return NextResponse.json({
    success: true,
    data: logs.map(l => ({
      id: l.id, action: l.action, oldValue: l.oldValues, newValue: l.newValues,
      changedBy: l.actorId, changedByName: nameMap[l.actorId] ?? l.actorId,
      reason: l.reason, createdAt: l.createdAt.toISOString(),
    })),
  });
});

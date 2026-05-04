import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

const withOrgAuth = withOrgAuthForModule("clientMeetings.clients");

/** GET /api/client-meetings/clients/[id]/logs — audit history for one Client. */
export const GET = withOrgAuth<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const client = await db.client.findFirst({ where: { id: params.id, orgId }, select: { id: true } });
  if (!client) return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });

  const logs = await db.auditLog.findMany({
    where: { orgId, entityType: "Client", entityId: params.id },
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
      id: l.id, action: l.action,
      oldValue: l.oldValues, newValue: l.newValues,
      changedBy: l.actorId, changedByName: nameMap[l.actorId] ?? l.actorId,
      reason: l.reason, createdAt: l.createdAt.toISOString(),
    })),
  });
});

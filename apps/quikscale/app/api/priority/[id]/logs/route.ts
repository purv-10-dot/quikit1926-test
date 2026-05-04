import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("priority");

// GET /api/priority/[id]/logs — change history for a Priority (read-only)
// Source: AuditLog rows where entityType=Priority and entityId=id
export const GET = withTenantAuth<{ id: string }>(
  async ({ orgId }, _request, { params }) => {
    const priority = await db.priority.findUnique({
      where: { id: params.id },
      select: { orgId: true },
    });
    if (!priority) {
      return NextResponse.json({ success: false, error: "Priority not found" }, { status: 404 });
    }
    if (priority.orgId !== orgId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
    }

    const logs = await db.auditLog.findMany({
      where: { orgId, entityType: "Priority", entityId: params.id },
      select: {
        id: true,
        action: true,
        oldValues: true,
        newValues: true,
        actorId: true,
        reason: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const userIds = [...new Set(logs.map((l) => l.actorId))];
    const users = await db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const userMap = Object.fromEntries(
      users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]),
    );

    // Normalize to the same shape the KPI logs modal consumes:
    //   { id, action, oldValue, newValue, changedBy, changedByName, reason, createdAt }
    const enriched = logs.map((l) => ({
      id: l.id,
      action: l.action,
      oldValue: l.oldValues,
      newValue: l.newValues,
      changedBy: l.actorId,
      changedByName: userMap[l.actorId] ?? l.actorId,
      reason: l.reason,
      createdAt: l.createdAt,
    }));

    return NextResponse.json({ success: true, data: enriched });
  },
  { fallbackErrorMessage: "Failed to fetch priority logs" },
);

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api/requireAdmin";
import type { AuditEntityType } from "@/lib/api/auditLog";

/**
 * GET /api/audit-logs?entityType=Review&entityId=xxx&extra=quarter|rowIndex=0
 *
 * Generic audit-history endpoint backing <AuditLogDrawer />. Returns the
 * normalized shape the drawer renders (id / action / oldValue / newValue /
 * changedByName / reason / createdAt) for any allowlisted entity type.
 *
 * `extra` is an optional substring filter against AuditLog.reason — used by
 * OPSP Review to scope a single OPSP row's audit log to a specific
 * (horizon, rowIndex) cell, matching the reason strings the write endpoints
 * record (see opsp/review/*.ts).
 */

const ALLOWED_ENTITY_TYPES: ReadonlySet<AuditEntityType> = new Set([
  "Review",
  "DailyHuddle",
  "WeeklyMeeting",
  "Priority",
  "WWWItem",
  "KPI",
  "OPSPData",
  "Meeting",
  "Team",
  "ClientMember",
  "Client",
]);

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId } = auth;

    const { searchParams } = req.nextUrl;
    const entityType = searchParams.get("entityType");
    const entityId = searchParams.get("entityId");
    const extra = searchParams.get("extra") ?? "";

    if (!entityType || !entityId) {
      return NextResponse.json(
        { success: false, error: "entityType and entityId are required" },
        { status: 400 },
      );
    }

    if (!ALLOWED_ENTITY_TYPES.has(entityType as AuditEntityType)) {
      return NextResponse.json(
        { success: false, error: `entityType '${entityType}' is not allowed` },
        { status: 400 },
      );
    }

    const logs = await db.auditLog.findMany({
      where: {
        orgId,
        entityType,
        entityId,
        ...(extra ? { reason: { contains: extra } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        action: true,
        oldValues: true,
        newValues: true,
        actorId: true,
        reason: true,
        createdAt: true,
      },
    });

    const userIds = [...new Set(logs.map((l) => l.actorId))];
    const users = userIds.length
      ? await db.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const nameMap = Object.fromEntries(
      users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]),
    );

    return NextResponse.json({
      success: true,
      data: logs.map((l) => ({
        id: l.id,
        action: l.action,
        oldValue: l.oldValues,
        newValue: l.newValues,
        changedBy: l.actorId,
        changedByName: nameMap[l.actorId] ?? l.actorId,
        reason: l.reason,
        createdAt: l.createdAt.toISOString(),
      })),
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to load audit logs";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

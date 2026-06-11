import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

const withOrgAuth = withOrgAuthForModule("kpi");

/**
 * GET /api/audit/unread-count
 *   ?entityType=KPI&entityId=<id>   → unread count for one entity (badge)
 *   ?moduleKey=KPI                  → unread count across the module (sidebar dot)
 *
 * Unread = events created after the user's read mark AND not authored by them
 * (editors implicitly read their own actions). Gated by KPI module access.
 */
export const GET = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const entityId = sp.get("entityId");
  const entityType = sp.get("entityType") ?? sp.get("moduleKey") ?? "KPI";

  if (entityId) {
    // Per-entity: read marker + a single indexed COUNT.
    const mark = await db.auditEventRead.findUnique({
      where: { userId_entityType_entityId: { userId, entityType, entityId } },
      select: { lastReadAt: true },
    });
    const lastReadAt = mark?.lastReadAt ?? new Date(0);
    const unread = await db.auditEvent.count({
      where: {
        orgId,
        entityType,
        entityId,
        createdAt: { gt: lastReadAt },
        actorUserId: { not: userId },
      },
    });
    return NextResponse.json({ success: true, data: { unread } });
  }

  // Module-level: left-join events to each entity's read marker.
  const rows = await db.$queryRaw<{ unread: number }[]>`
    SELECT COUNT(*)::int AS unread
    FROM app_quikscale."AuditEvent" e
    LEFT JOIN app_quikscale."AuditEventRead" r
      ON r."userId" = ${userId}
     AND r."entityType" = e."entityType"
     AND r."entityId" = e."entityId"
    WHERE e."orgId" = ${orgId}
      AND e."entityType" = ${entityType}
      AND e."actorUserId" <> ${userId}
      AND (r."lastReadAt" IS NULL OR e."createdAt" > r."lastReadAt")
  `;
  const unread = Number(rows[0]?.unread ?? 0);
  return NextResponse.json({ success: true, data: { unread } });
}, { fallbackErrorMessage: "Failed to compute unread count" });

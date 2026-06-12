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
  const entityIdsParam = sp.get("entityIds");
  const entityType = sp.get("entityType") ?? sp.get("moduleKey") ?? "KPI";

  // Batch mode: `?entityType=KPI&entityIds=a,b,c` → `{ counts: { id: n } }`.
  // One GROUP BY query for the whole visible page instead of one request per
  // row (kills the per-row N+1 the list tables previously fired).
  if (entityIdsParam !== null) {
    const ids = entityIdsParam.split(",").map((s) => s.trim()).filter(Boolean);
    const counts: Record<string, number> = {};
    for (const id of ids) counts[id] = 0;
    if (ids.length > 0) {
      const rows = await db.$queryRaw<{ entityId: string; unread: number }[]>`
        SELECT e."entityId" AS "entityId", COUNT(*)::int AS unread
        FROM app_quikscale."AuditEvent" e
        LEFT JOIN app_quikscale."AuditEventRead" r
          ON r."userId" = ${userId}
         AND r."entityType" = e."entityType"
         AND r."entityId" = e."entityId"
        WHERE e."orgId" = ${orgId}
          AND e."entityType" = ${entityType}
          AND e."entityId" = ANY(${ids})
          AND e."actorUserId" <> ${userId}
          AND (r."lastReadAt" IS NULL OR e."createdAt" > r."lastReadAt")
        GROUP BY e."entityId"
      `;
      for (const row of rows) counts[row.entityId] = Number(row.unread);
    }
    return NextResponse.json({ success: true, data: { counts } });
  }

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

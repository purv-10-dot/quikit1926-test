import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

const withOrgAuth = withOrgAuthForModule("www");

/**
 * GET /api/www/[id]/audit — full Change History timeline for one WWW item.
 *
 * Reads the centralized AuditEvent + AuditChange tables (the new system),
 * mirroring /api/kpi|priority/[id]/audit. Newest-first; the panel does its own
 * client-side filtering/search/counts so the API stays a simple read.
 *
 * Uses findUnique (NOT findFirst) for the existence check so soft-deleted items
 * can still have their history viewed.
 */
const MAX_EVENTS = 1000;

export const GET = withOrgAuth<{ id: string }>(
  async ({ orgId }, _request, { params }) => {
    const item = await db.wWWItem.findUnique({
      where: { id: params.id },
      select: { orgId: true },
    });
    // Cross-tenant requests return 404 (NOT 403) so we never reveal whether a
    // WWW id exists in another org.
    if (!item || item.orgId !== orgId) {
      return NextResponse.json({ success: false, error: "WWW item not found" }, { status: 404 });
    }

    const events = await db.auditEvent.findMany({
      where: { orgId, entityType: "WWW", entityId: params.id },
      select: {
        id: true,
        action: true,
        actorUserId: true,
        actorName: true,
        source: true,
        reason: true,
        snapshot: true,
        createdAt: true,
        teamId: true,
        changes: {
          select: { fieldName: true, oldValue: true, newValue: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_EVENTS,
    });

    return NextResponse.json({
      success: true,
      data: events,
      meta: { total: events.length, capped: events.length === MAX_EVENTS },
    });
  },
  { fallbackErrorMessage: "Failed to fetch WWW audit history" },
);

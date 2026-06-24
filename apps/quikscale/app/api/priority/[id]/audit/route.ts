import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

const withOrgAuth = withOrgAuthForModule("priority");

/**
 * GET /api/priority/[id]/audit — full Change History timeline for one Priority.
 *
 * Reads the centralized AuditEvent + AuditChange tables (the new system),
 * mirroring /api/kpi/[id]/audit. Returns the complete per-entity timeline
 * newest-first; the Change History panel does its own client-side filtering,
 * search, and tab counts, so the API stays a simple, cacheable read.
 *
 * Uses findUnique (NOT findFirst) for the existence check so soft-deleted
 * Priorities can still have their history viewed.
 */
const MAX_EVENTS = 1000;

export const GET = withOrgAuth<{ id: string }>(
  async ({ orgId }, _request, { params }) => {
    const priority = await db.priority.findUnique({
      where: { id: params.id },
      select: { orgId: true },
    });
    // Cross-tenant requests return 404 (NOT 403) so we never reveal whether a
    // Priority id exists in another org. The route wrapper already returns 403
    // when the caller lacks Priority module access.
    if (!priority || priority.orgId !== orgId) {
      return NextResponse.json({ success: false, error: "Priority not found" }, { status: 404 });
    }

    const events = await db.auditEvent.findMany({
      where: { orgId, entityType: "PRIORITY", entityId: params.id },
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
  { fallbackErrorMessage: "Failed to fetch priority audit history" },
);

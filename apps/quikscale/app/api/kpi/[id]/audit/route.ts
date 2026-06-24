import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

const withOrgAuth = withOrgAuthForModule("kpi");

/**
 * GET /api/kpi/[id]/audit — full Change History timeline for one KPI.
 *
 * Reads the centralized AuditEvent + AuditChange tables (the new system).
 * Returns the complete per-entity timeline newest-first; the Change History
 * panel does its own client-side filtering (All/Create/Update/Delete tabs),
 * search, and tab counts, so the API stays a simple, cacheable read.
 *
 * `actorName` is denormalized on the event, so no user join is needed — the
 * name reflects who acted AT THE TIME of the event.
 *
 * Uses findUnique (NOT findFirst) for the KPI existence check so soft-deleted
 * KPIs can still have their history viewed (the soft-delete middleware only
 * filters findMany/findFirst/count).
 */
const MAX_EVENTS = 1000;

export const GET = withOrgAuth<{ id: string }>(
  async ({ orgId }, _request, { params }) => {
    const kpi = await db.kPI.findUnique({
      where: { id: params.id },
      select: { orgId: true },
    });
    // Cross-tenant requests return 404 (NOT 403) so we never reveal whether a
    // KPI id exists in another org (AC-1.39). The route wrapper already returns
    // 403 when the caller lacks KPI module access.
    if (!kpi || kpi.orgId !== orgId) {
      return NextResponse.json({ success: false, error: "KPI not found" }, { status: 404 });
    }

    const events = await db.auditEvent.findMany({
      where: { orgId, entityType: "KPI", entityId: params.id },
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
  { fallbackErrorMessage: "Failed to fetch KPI audit history" },
);

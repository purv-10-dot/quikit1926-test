import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

const withOrgAuth = withOrgAuthForModule("clientMeetings.clients");

/**
 * GET /api/client-meetings/clients/[id]/audit — full Change History timeline
 * for one Client. Reads the centralized AuditEvent + AuditChange tables,
 * mirroring the KPI/Priority/WWW audit routes. findUnique so soft-deleted
 * clients can still have their history viewed.
 */
const MAX_EVENTS = 1000;

export const GET = withOrgAuth<{ id: string }>(
  async ({ orgId }, _request, { params }) => {
    const client = await db.client.findUnique({
      where: { id: params.id },
      select: { orgId: true },
    });
    if (!client || client.orgId !== orgId) {
      return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
    }

    const events = await db.auditEvent.findMany({
      where: { orgId, entityType: "CLIENT", entityId: params.id },
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
        changes: { select: { fieldName: true, oldValue: true, newValue: true } },
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
  { fallbackErrorMessage: "Failed to fetch client audit history" },
);

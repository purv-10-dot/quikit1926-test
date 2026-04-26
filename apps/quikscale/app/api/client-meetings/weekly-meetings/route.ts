import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { createWeeklyMeetingSchema } from "@/lib/schemas/clientMeetingsSchema";

const withTenantAuth = withTenantAuthForModule("clientMeetings.weeklyMeeting");

/**
 * GET /api/client-meetings/weekly-meetings?clientId=&from=&to=
 * Ordered newest first; soft-deleted hidden.
 */
export const GET = withTenantAuth(async ({ tenantId }, request) => {
  const url = new URL(request.url);
  const clientId = url.searchParams.get("clientId") ?? undefined;
  const from     = url.searchParams.get("from");
  const to       = url.searchParams.get("to");

  const where: Record<string, unknown> = { tenantId, deletedAt: null };
  if (clientId) where.clientId = clientId;
  if (from || to) {
    const range: Record<string, Date> = {};
    if (from) range.gte = new Date(from);
    if (to) { const d = new Date(to); d.setUTCHours(23, 59, 59, 999); range.lte = d; }
    where.meetingDate = range;
  }

  const rows = await db.clientWeeklyMeeting.findMany({
    where,
    orderBy: { meetingDate: "desc" },
    include: {
      client: { select: { id: true, name: true } },
      absentMembers: true,
      dashboardNAMembers: true,
    },
  });

  return NextResponse.json({
    success: true,
    data: rows.map(r => ({
      id: r.id,
      clientId: r.clientId, clientName: r.client.name,
      meetingDate: r.meetingDate.toISOString(),
      callStatus: r.callStatus,
      actualStartTime: r.actualStartTime, actualEndTime: r.actualEndTime,
      segmentTime1: r.segmentTime1, segmentTime2: r.segmentTime2,
      segmentTime3: r.segmentTime3, segmentTime4: r.segmentTime4,
      segmentTime5: r.segmentTime5, segmentTime6: r.segmentTime6,
      segmentTime7: r.segmentTime7,
      goodNewsSharing: r.goodNewsSharing, kpDashboard: r.kpDashboard,
      gaps: r.gaps, www: r.www, feedback: r.feedback,
      collectiveIntelligence: r.collectiveIntelligence,
      opspReview: r.opspReview,
      notesKPDashboard: r.notesKPDashboard, otherNotes: r.otherNotes,
      absentUserIds: r.absentMembers.map(a => a.userId),
      dashboardNAUserIds: r.dashboardNAMembers.map(a => a.userId),
    })),
  });
});

/** POST — create weekly meeting with absence + dashboardNA links + per-member scores. */
export const POST = withTenantAuth(async ({ tenantId, userId }, request) => {
  const parsed = createWeeklyMeetingSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json({ success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" }, { status: 400 });
  const d = parsed.data;

  const client = await db.client.findFirst({ where: { id: d.clientId, tenantId, deletedAt: null } });
  if (!client) return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });

  if (d.actualStartTime && d.actualEndTime && d.actualEndTime <= d.actualStartTime)
    return NextResponse.json({ success: false, error: "Actual end time must be after start time" }, { status: 400 });

  const created = await db.clientWeeklyMeeting.create({
    data: {
      tenantId, clientId: d.clientId,
      meetingDate: new Date(d.meetingDate),
      callStatus: d.callStatus,
      actualStartTime: d.actualStartTime ?? null, actualEndTime: d.actualEndTime ?? null,
      segmentTime1: d.segmentTime1 ?? null, segmentTime2: d.segmentTime2 ?? null,
      segmentTime3: d.segmentTime3 ?? null, segmentTime4: d.segmentTime4 ?? null,
      segmentTime5: d.segmentTime5 ?? null, segmentTime6: d.segmentTime6 ?? null,
      segmentTime7: d.segmentTime7 ?? null,
      goodNewsSharing: d.goodNewsSharing, kpDashboard: d.kpDashboard,
      gaps: d.gaps, www: d.www, feedback: d.feedback,
      collectiveIntelligence: d.collectiveIntelligence,
      opspReview: d.opspReview,
      notesKPDashboard: d.notesKPDashboard ?? null,
      otherNotes: d.otherNotes ?? null,
      createdBy: userId,
      absentMembers:      { create: d.absentUserIds.map(uid => ({ userId: uid })) },
      dashboardNAMembers: { create: d.dashboardNAUserIds.map(uid => ({ userId: uid })) },
    },
  });

  return NextResponse.json({ success: true, data: { id: created.id } }, { status: 201 });
});

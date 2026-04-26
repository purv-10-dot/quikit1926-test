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
      memberScores: true,
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
      formatCheck1: r.formatCheck1, formatCheck2: r.formatCheck2,
      wwwReviewDone: r.wwwReviewDone, feedbackDone: r.feedbackDone,
      collectiveIntelDone: r.collectiveIntelDone, kpGapsDiscussed: r.kpGapsDiscussed,
      dashboardQuality: r.dashboardQuality, punctualityOverride: r.punctualityOverride,
      totalMembers: r.totalMembers, notes: r.notes,
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

  const totalMembers = d.totalMembers || (await db.clientMembership.count({
    where: { clientId: d.clientId, deletedAt: null },
  }));

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
      formatCheck1: d.formatCheck1, formatCheck2: d.formatCheck2,
      wwwReviewDone: d.wwwReviewDone, feedbackDone: d.feedbackDone,
      collectiveIntelDone: d.collectiveIntelDone, kpGapsDiscussed: d.kpGapsDiscussed,
      dashboardQuality: d.dashboardQuality, punctualityOverride: d.punctualityOverride,
      totalMembers, notes: d.notes ?? null,
      createdBy: userId,
      absentMembers:      { create: d.absentUserIds.map(uid => ({ userId: uid })) },
      dashboardNAMembers: { create: d.dashboardNAUserIds.map(uid => ({ userId: uid })) },
      memberScores:       { create: d.memberScores.map(s => ({
        userId: s.userId,
        kpiWeeklyQTD: s.kpiWeeklyQTD, kpiCoding: s.kpiCoding,
        priorityNotes: s.priorityNotes, priorityStartEndDate: s.priorityStartEndDate,
        priorityColor: s.priorityColor,
      })) },
    },
  });

  return NextResponse.json({ success: true, data: { id: created.id } }, { status: 201 });
});

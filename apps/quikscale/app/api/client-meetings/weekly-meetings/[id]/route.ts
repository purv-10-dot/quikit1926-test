import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { updateWeeklyMeetingSchema } from "@/lib/schemas/clientMeetingsSchema";

const withTenantAuth = withTenantAuthForModule("clientMeetings.weeklyMeeting");

export const GET = withTenantAuth<{ id: string }>(async ({ tenantId }, _req, { params }) => {
  const row = await db.clientWeeklyMeeting.findFirst({
    where: { id: params.id, tenantId, deletedAt: null },
    include: {
      client: { select: { id: true, name: true } },
      absentMembers: true, dashboardNAMembers: true, memberScores: true,
    },
  });
  if (!row) return NextResponse.json({ success: false, error: "Weekly meeting not found" }, { status: 404 });

  return NextResponse.json({
    success: true,
    data: {
      ...row,
      meetingDate: row.meetingDate.toISOString(),
      absentUserIds: row.absentMembers.map(a => a.userId),
      dashboardNAUserIds: row.dashboardNAMembers.map(a => a.userId),
    },
  });
});

/** PUT — replaces absence/dashboardNA/memberScores atomically. */
export const PUT = withTenantAuth<{ id: string }>(async ({ tenantId, userId }, request, { params }) => {
  const parsed = updateWeeklyMeetingSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json({ success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" }, { status: 400 });
  const d = parsed.data;

  const existing = await db.clientWeeklyMeeting.findFirst({ where: { id: params.id, tenantId, deletedAt: null } });
  if (!existing) return NextResponse.json({ success: false, error: "Weekly meeting not found" }, { status: 404 });

  if (d.actualStartTime && d.actualEndTime && d.actualEndTime <= d.actualStartTime)
    return NextResponse.json({ success: false, error: "Actual end time must be after start time" }, { status: 400 });

  await db.$transaction(async tx => {
    await tx.clientWeeklyMeeting.update({
      where: { id: params.id },
      data: {
        meetingDate: d.meetingDate ? new Date(d.meetingDate) : undefined,
        callStatus: d.callStatus,
        actualStartTime: d.actualStartTime, actualEndTime: d.actualEndTime,
        segmentTime1: d.segmentTime1, segmentTime2: d.segmentTime2,
        segmentTime3: d.segmentTime3, segmentTime4: d.segmentTime4,
        segmentTime5: d.segmentTime5, segmentTime6: d.segmentTime6,
        segmentTime7: d.segmentTime7,
        formatCheck1: d.formatCheck1, formatCheck2: d.formatCheck2,
        wwwReviewDone: d.wwwReviewDone, feedbackDone: d.feedbackDone,
        collectiveIntelDone: d.collectiveIntelDone, kpGapsDiscussed: d.kpGapsDiscussed,
        dashboardQuality: d.dashboardQuality, punctualityOverride: d.punctualityOverride,
        totalMembers: d.totalMembers, notes: d.notes,
        updatedBy: userId,
      },
    });
    if (d.absentUserIds !== undefined) {
      await tx.clientWeeklyMeetingAbsence.deleteMany({ where: { meetingId: params.id } });
      if (d.absentUserIds.length > 0) {
        await tx.clientWeeklyMeetingAbsence.createMany({
          data: d.absentUserIds.map(uid => ({ meetingId: params.id, userId: uid })),
        });
      }
    }
    if (d.dashboardNAUserIds !== undefined) {
      await tx.clientWeeklyMeetingDashboardNA.deleteMany({ where: { meetingId: params.id } });
      if (d.dashboardNAUserIds.length > 0) {
        await tx.clientWeeklyMeetingDashboardNA.createMany({
          data: d.dashboardNAUserIds.map(uid => ({ meetingId: params.id, userId: uid })),
        });
      }
    }
    if (d.memberScores !== undefined) {
      await tx.clientWeeklyMemberScore.deleteMany({ where: { meetingId: params.id } });
      if (d.memberScores.length > 0) {
        await tx.clientWeeklyMemberScore.createMany({
          data: d.memberScores.map(s => ({
            meetingId: params.id, userId: s.userId,
            kpiWeeklyQTD: s.kpiWeeklyQTD, kpiCoding: s.kpiCoding,
            priorityNotes: s.priorityNotes, priorityStartEndDate: s.priorityStartEndDate,
            priorityColor: s.priorityColor,
          })),
        });
      }
    }
  });

  return NextResponse.json({ success: true });
});

export const DELETE = withTenantAuth<{ id: string }>(async ({ tenantId }, _req, { params }) => {
  const existing = await db.clientWeeklyMeeting.findFirst({ where: { id: params.id, tenantId, deletedAt: null } });
  if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  await db.clientWeeklyMeeting.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
  return NextResponse.json({ success: true });
});

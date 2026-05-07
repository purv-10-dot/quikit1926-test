import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { updateWeeklyMeetingSchema } from "@/lib/schemas/clientMeetingsSchema";

const withOrgAuth = withOrgAuthForModule("clientMeetings.weeklyMeeting");

export const GET = withOrgAuth<{ id: string }>(
  async ({ orgId }, _req, { params }) => {
    const row = await db.clientWeeklyMeeting.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: {
        client: { select: { id: true, name: true } },
        absentMembers: true,
        dashboardNAMembers: true,
        absentTeamMembers: true,
        dashboardNATeamMembers: true,
        memberScores: true,
      },
    });
    if (!row)
      return NextResponse.json(
        { success: false, error: "Weekly meeting not found" },
        { status: 404 }
      );

    return NextResponse.json({
      success: true,
      data: {
        ...row,
        meetingDate: row.meetingDate.toISOString(),
        absentUserIds: row.absentMembers.map((a) => a.userId),
        dashboardNAUserIds: row.dashboardNAMembers.map((a) => a.userId),
        absentClientMemberIds: row.absentTeamMembers.map(
          (a) => a.clientMemberId
        ),
        dashboardNAClientMemberIds: row.dashboardNATeamMembers.map(
          (a) => a.clientMemberId
        ),
        memberScores: row.memberScores.map((s) => ({
          userId: s.clientMemberId,
          kpiWeeklyQTD: s.kpiWeeklyQTD,
          kpiCoding: s.kpiCoding,
          priorityNotes: s.priorityNotes,
          priorityStartEndDate: s.priorityStartEndDate,
          priorityColor: s.priorityColor,
        })),
      },
    });
  }
);

/** PUT — replaces absence + dashboardNA links atomically. */
export const PUT = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, request, { params }) => {
    const parsed = updateWeeklyMeetingSchema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.errors[0]?.message ?? "Invalid input",
        },
        { status: 400 }
      );
    const d = parsed.data;

    const existing = await db.clientWeeklyMeeting.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!existing)
      return NextResponse.json(
        { success: false, error: "Weekly meeting not found" },
        { status: 404 }
      );

    if (
      d.actualStartTime &&
      d.actualEndTime &&
      d.actualEndTime <= d.actualStartTime
    )
      return NextResponse.json(
        { success: false, error: "Actual end time must be after start time" },
        { status: 400 }
      );

    // ── One-meeting-per-client-per-week rule (PUT side) ──────────────────
    // Same constraint as POST. Move-within-the-same-week is fine because
    // we exclude the current meeting's id from the lookup. Move TO a week
    // that already has another meeting for this client → 409.
    if (d.meetingDate) {
      const newDate = new Date(d.meetingDate);
      const day = newDate.getDay();
      const daysFromMonday = day === 0 ? 6 : day - 1;
      const weekStart = new Date(newDate);
      weekStart.setDate(newDate.getDate() - daysFromMonday);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      const conflict = await db.clientWeeklyMeeting.findFirst({
        where: {
          orgId,
          clientId: existing.clientId,
          deletedAt: null,
          meetingDate: { gte: weekStart, lte: weekEnd },
          id: { not: params.id },
        },
        select: { id: true },
      });
      if (conflict) {
        const dd = (x: Date) =>
          `${String(x.getDate()).padStart(2, "0")}/${String(x.getMonth() + 1).padStart(2, "0")}/${x.getFullYear()}`;
        return NextResponse.json(
          {
            success: false,
            error: `A weekly meeting for the selected client already exists between ${dd(weekStart)} and ${dd(weekEnd)}.`,
          },
          { status: 409 },
        );
      }
    }

    const oldSnapshot = JSON.stringify({
      callStatus: existing.callStatus,
      meetingDate: existing.meetingDate.toISOString(),
      goodNewsSharing: existing.goodNewsSharing,
      kpDashboard: existing.kpDashboard,
      gaps: existing.gaps,
      www: existing.www,
      feedback: existing.feedback,
      collectiveIntelligence: existing.collectiveIntelligence,
      opspReview: existing.opspReview,
    });

    await db.$transaction(async (tx) => {
      await tx.clientWeeklyMeeting.update({
        where: { id: params.id },
        data: {
          meetingDate: d.meetingDate ? new Date(d.meetingDate) : undefined,
          callStatus: d.callStatus,
          actualStartTime: d.actualStartTime,
          actualEndTime: d.actualEndTime,
          segmentTime1: d.segmentTime1,
          segmentTime2: d.segmentTime2,
          segmentTime3: d.segmentTime3,
          segmentTime4: d.segmentTime4,
          segmentTime5: d.segmentTime5,
          segmentTime6: d.segmentTime6,
          segmentTime7: d.segmentTime7,
          goodNewsSharing: d.goodNewsSharing,
          kpDashboard: d.kpDashboard,
          gaps: d.gaps,
          www: d.www,
          feedback: d.feedback,
          collectiveIntelligence: d.collectiveIntelligence,
          opspReview: d.opspReview,
          notesKPDashboard: d.notesKPDashboard,
          otherNotes: d.otherNotes,
          updatedBy: userId,
        },
      });
      if (d.absentUserIds !== undefined) {
        await tx.clientWeeklyMeetingAbsence.deleteMany({
          where: { meetingId: params.id },
        });
        if (d.absentUserIds.length > 0) {
          await tx.clientWeeklyMeetingAbsence.createMany({
            data: d.absentUserIds.map((uid) => ({
              meetingId: params.id,
              userId: uid,
            })),
          });
        }
      }
      if (d.dashboardNAUserIds !== undefined) {
        await tx.clientWeeklyMeetingDashboardNA.deleteMany({
          where: { meetingId: params.id },
        });
        if (d.dashboardNAUserIds.length > 0) {
          await tx.clientWeeklyMeetingDashboardNA.createMany({
            data: d.dashboardNAUserIds.map((uid) => ({
              meetingId: params.id,
              userId: uid,
            })),
          });
        }
      }
      if (d.absentClientMemberIds !== undefined) {
        await tx.clientWeeklyMeetingTeamAbsence.deleteMany({
          where: { meetingId: params.id },
        });
        if (d.absentClientMemberIds.length > 0) {
          await tx.clientWeeklyMeetingTeamAbsence.createMany({
            data: d.absentClientMemberIds.map((cmid) => ({
              meetingId: params.id,
              clientMemberId: cmid,
            })),
          });
        }
      }
      if (d.dashboardNAClientMemberIds !== undefined) {
        await tx.clientWeeklyMeetingTeamDashboardNA.deleteMany({
          where: { meetingId: params.id },
        });
        if (d.dashboardNAClientMemberIds.length > 0) {
          await tx.clientWeeklyMeetingTeamDashboardNA.createMany({
            data: d.dashboardNAClientMemberIds.map((cmid) => ({
              meetingId: params.id,
              clientMemberId: cmid,
            })),
          });
        }
      }
    });

    const updated = await db.clientWeeklyMeeting.findUnique({
      where: { id: params.id },
      select: {
        callStatus: true,
        meetingDate: true,
        goodNewsSharing: true,
        kpDashboard: true,
        gaps: true,
        www: true,
        feedback: true,
        collectiveIntelligence: true,
        opspReview: true,
      },
    });
    await db.clientWeeklyMeetingLog.create({
      data: {
        orgId,
        meetingId: params.id,
        action: "UPDATE",
        oldValue: oldSnapshot,
        newValue: JSON.stringify({
          ...updated,
          meetingDate: updated?.meetingDate.toISOString() ?? null,
        }),
        changedBy: userId,
      },
    });

    return NextResponse.json({ success: true });
  }
);

export const DELETE = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const existing = await db.clientWeeklyMeeting.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!existing)
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 }
      );
    await db.clientWeeklyMeeting.update({
      where: { id: params.id },
      data: { deletedAt: new Date() },
    });
    await db.clientWeeklyMeetingLog.create({
      data: {
        orgId,
        meetingId: params.id,
        action: "DELETE",
        oldValue: JSON.stringify({
          callStatus: existing.callStatus,
          meetingDate: existing.meetingDate.toISOString(),
        }),
        changedBy: userId,
      },
    });
    return NextResponse.json({ success: true });
  }
);

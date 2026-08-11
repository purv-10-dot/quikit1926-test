import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { updateWeeklyMeetingSchema } from "@/lib/schemas/clientMeetingsSchema";
import {
  audit,
  requestContext,
  classifyUpdateAction,
  diffFields,
  WEEKLY_MEETING_AUDIT_FIELDS,
} from "@/lib/audit";

const withOrgAuth = withOrgAuthForModule("clientMeetings.weeklyMeeting");

/** Project a meeting record + its member-id arrays into the audited shape. */
function weeklyAuditShape(
  m: {
    meetingDate: Date; callStatus: string; callStatusOther: string | null;
    actualStartTime: string | null; actualEndTime: string | null;
    segmentTime1: string | null; segmentTime2: string | null; segmentTime3: string | null;
    segmentTime4: string | null; segmentTime5: string | null; segmentTime6: string | null; segmentTime7: string | null;
    punctualityOverride: string; goodNewsSharing: string; kpDashboard: string; gaps: string;
    www: string; feedback: string; collectiveIntelligence: string; opspReview: string;
    notesKPDashboard: string | null; otherNotes: string | null;
  },
  absentIds: string[],
  dashboardNAIds: string[],
): Record<string, unknown> {
  return {
    meetingDate: m.meetingDate.toISOString(),
    callStatus: m.callStatus,
    callStatusOther: m.callStatusOther,
    actualStartTime: m.actualStartTime,
    actualEndTime: m.actualEndTime,
    segmentTime1: m.segmentTime1, segmentTime2: m.segmentTime2, segmentTime3: m.segmentTime3,
    segmentTime4: m.segmentTime4, segmentTime5: m.segmentTime5, segmentTime6: m.segmentTime6, segmentTime7: m.segmentTime7,
    punctualityOverride: m.punctualityOverride,
    goodNewsSharing: m.goodNewsSharing, kpDashboard: m.kpDashboard, gaps: m.gaps, www: m.www,
    feedback: m.feedback, collectiveIntelligence: m.collectiveIntelligence, opspReview: m.opspReview,
    notesKPDashboard: m.notesKPDashboard, otherNotes: m.otherNotes,
    absentClientMemberIds: [...absentIds].sort(),
    dashboardNAClientMemberIds: [...dashboardNAIds].sort(),
  };
}

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
      include: {
        absentMembers: { select: { userId: true } },
        dashboardNAMembers: { select: { userId: true } },
        absentTeamMembers: { select: { clientMemberId: true } },
        dashboardNATeamMembers: { select: { clientMemberId: true } },
      },
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

    const sortIds = <T extends string>(arr: T[]): T[] => [...arr].sort();

    // Compute callStatusOther taking the partial-update semantics into account:
    //   - status changing to OTHER  → use the new label (refine enforced presence)
    //   - status changing to non-OTHER → force null so a stale label can't survive
    //   - only the label changed     → write the new label as-is (existing status stays OTHER)
    //   - neither field provided     → undefined (Prisma leaves the column untouched)
    const newCallStatusOther: string | null | undefined = (() => {
      if (d.callStatus === "OTHER") return d.callStatusOther?.trim() || null;
      if (d.callStatus !== undefined) return null;
      if (d.callStatusOther !== undefined) return d.callStatusOther?.trim() || null;
      return undefined;
    })();

    const oldSnapshot = JSON.stringify({
      callStatus: existing.callStatus,
      callStatusOther: existing.callStatusOther,
      meetingDate: existing.meetingDate.toISOString(),
      actualStartTime: existing.actualStartTime,
      actualEndTime: existing.actualEndTime,
      segmentTime1: existing.segmentTime1,
      segmentTime2: existing.segmentTime2,
      segmentTime3: existing.segmentTime3,
      segmentTime4: existing.segmentTime4,
      segmentTime5: existing.segmentTime5,
      segmentTime6: existing.segmentTime6,
      segmentTime7: existing.segmentTime7,
      punctualityOverride: existing.punctualityOverride,
      goodNewsSharing: existing.goodNewsSharing,
      kpDashboard: existing.kpDashboard,
      gaps: existing.gaps,
      www: existing.www,
      feedback: existing.feedback,
      collectiveIntelligence: existing.collectiveIntelligence,
      opspReview: existing.opspReview,
      notesKPDashboard: existing.notesKPDashboard,
      otherNotes: existing.otherNotes,
      absentUserIds: sortIds(existing.absentMembers.map((m) => m.userId)),
      dashboardNAUserIds: sortIds(existing.dashboardNAMembers.map((m) => m.userId)),
      absentClientMemberIds: sortIds(existing.absentTeamMembers.map((m) => m.clientMemberId)),
      dashboardNAClientMemberIds: sortIds(existing.dashboardNATeamMembers.map((m) => m.clientMemberId)),
    });

    await db.$transaction(async (tx) => {
      await tx.clientWeeklyMeeting.update({
        where: { id: params.id },
        data: {
          meetingDate: d.meetingDate ? new Date(d.meetingDate) : undefined,
          callStatus: d.callStatus,
          callStatusOther: newCallStatusOther,
          actualStartTime: d.actualStartTime,
          actualEndTime: d.actualEndTime,
          segmentTime1: d.segmentTime1,
          segmentTime2: d.segmentTime2,
          segmentTime3: d.segmentTime3,
          segmentTime4: d.segmentTime4,
          segmentTime5: d.segmentTime5,
          segmentTime6: d.segmentTime6,
          segmentTime7: d.segmentTime7,
          punctualityOverride: d.punctualityOverride,
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

      // A member just flagged Absent/Dashboard-NA for this meeting can't also
      // carry a saved score for it — a stale ClientWeeklyMemberScore row here
      // is exactly what let the "Quality of the dashboards" dashboard cell and
      // the Member Punch-In Excel export disagree (86% vs 90.3%). Clear it in
      // the same transaction so the two can never diverge again.
      const clearedMemberIds = [
        ...(d.absentClientMemberIds ?? []),
        ...(d.dashboardNAClientMemberIds ?? []),
      ];
      if (clearedMemberIds.length > 0) {
        await tx.clientWeeklyMemberScore.deleteMany({
          where: { meetingId: params.id, clientMemberId: { in: clearedMemberIds } },
        });
      }
    });

    const updated = await db.clientWeeklyMeeting.findUnique({
      where: { id: params.id },
      select: {
        callStatus: true,
        callStatusOther: true,
        meetingDate: true,
        actualStartTime: true,
        actualEndTime: true,
        segmentTime1: true,
        segmentTime2: true,
        segmentTime3: true,
        segmentTime4: true,
        segmentTime5: true,
        segmentTime6: true,
        segmentTime7: true,
        punctualityOverride: true,
        goodNewsSharing: true,
        kpDashboard: true,
        gaps: true,
        www: true,
        feedback: true,
        collectiveIntelligence: true,
        opspReview: true,
        notesKPDashboard: true,
        otherNotes: true,
        absentMembers: { select: { userId: true } },
        dashboardNAMembers: { select: { userId: true } },
        absentTeamMembers: { select: { clientMemberId: true } },
        dashboardNATeamMembers: { select: { clientMemberId: true } },
      },
    });
    await db.clientWeeklyMeetingLog.create({
      data: {
        orgId,
        meetingId: params.id,
        action: "UPDATE",
        oldValue: oldSnapshot,
        newValue: JSON.stringify({
          callStatus: updated?.callStatus,
          callStatusOther: updated?.callStatusOther,
          meetingDate: updated?.meetingDate.toISOString() ?? null,
          actualStartTime: updated?.actualStartTime,
          actualEndTime: updated?.actualEndTime,
          segmentTime1: updated?.segmentTime1,
          segmentTime2: updated?.segmentTime2,
          segmentTime3: updated?.segmentTime3,
          segmentTime4: updated?.segmentTime4,
          segmentTime5: updated?.segmentTime5,
          segmentTime6: updated?.segmentTime6,
          segmentTime7: updated?.segmentTime7,
          punctualityOverride: updated?.punctualityOverride,
          goodNewsSharing: updated?.goodNewsSharing,
          kpDashboard: updated?.kpDashboard,
          gaps: updated?.gaps,
          www: updated?.www,
          feedback: updated?.feedback,
          collectiveIntelligence: updated?.collectiveIntelligence,
          opspReview: updated?.opspReview,
          notesKPDashboard: updated?.notesKPDashboard,
          otherNotes: updated?.otherNotes,
          absentUserIds: sortIds((updated?.absentMembers ?? []).map((m) => m.userId)),
          dashboardNAUserIds: sortIds((updated?.dashboardNAMembers ?? []).map((m) => m.userId)),
          absentClientMemberIds: sortIds((updated?.absentTeamMembers ?? []).map((m) => m.clientMemberId)),
          dashboardNAClientMemberIds: sortIds((updated?.dashboardNATeamMembers ?? []).map((m) => m.clientMemberId)),
        }),
        changedBy: userId,
      },
    });

    // ── Centralized audit (dual-write) ── full before/after diff incl.
    // absences + Dashboard-NA (resolved to member names); callStatus → STATUS.
    if (updated) {
      const before = weeklyAuditShape(
        existing,
        existing.absentTeamMembers.map((m) => m.clientMemberId),
        existing.dashboardNATeamMembers.map((m) => m.clientMemberId),
      );
      const after = weeklyAuditShape(
        updated,
        updated.absentTeamMembers.map((m) => m.clientMemberId),
        updated.dashboardNATeamMembers.map((m) => m.clientMemberId),
      );
      const auditChanges = diffFields(before, after, { include: WEEKLY_MEETING_AUDIT_FIELDS });

      // Resolve absent + Dashboard-NA member ids → names (denormalized) for the
      // two array change rows.
      const memberFields = ["absentClientMemberIds", "dashboardNAClientMemberIds"];
      const ids = [
        ...new Set(
          auditChanges
            .filter((c) => memberFields.includes(c.fieldName))
            .flatMap((c) => [
              ...(((c.oldValue as string[] | null) ?? [])),
              ...(((c.newValue as string[] | null) ?? [])),
            ]),
        ),
      ];
      if (ids.length) {
        const mems = await db.clientMember.findMany({ where: { id: { in: ids }, orgId }, select: { id: true, name: true } });
        const nameOf = new Map(mems.map((m) => [m.id, m.name]));
        const toNames = (v: unknown) =>
          Array.isArray(v) ? v.map((id) => nameOf.get(String(id)) ?? String(id)) : v;
        for (const c of auditChanges) {
          if (memberFields.includes(c.fieldName)) {
            c.oldValue = toNames(c.oldValue);
            c.newValue = toNames(c.newValue);
          }
        }
      }

      await audit.log({
        entityType: "WEEKLY_MEETING",
        entityId: params.id,
        action: classifyUpdateAction(auditChanges.map((c) => c.fieldName)),
        actor: { userId, orgId, teamId: null },
        changes: auditChanges,
        skipIfNoChanges: true,
        ...requestContext(request),
      });
    }

    return NextResponse.json({ success: true });
  }
);

export const DELETE = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, request, { params }) => {
    const existing = await db.clientWeeklyMeeting.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: { client: { select: { name: true } } },
    });
    if (!existing)
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 }
      );

    // Optional (never required) reason — shown in the timeline if provided.
    const body = await request.json().catch(() => ({}));
    const reason =
      typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim() : null;

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
        reason,
        changedBy: userId,
      },
    });

    // ── Centralized audit (dual-write) ── DELETE with a friendly identity.
    const dateLabel = existing.meetingDate.toISOString().slice(0, 10);
    await audit.log({
      entityType: "WEEKLY_MEETING",
      entityId: params.id,
      action: "DELETE",
      actor: { userId, orgId, teamId: null },
      reason,
      snapshot: { name: `${existing.client.name} · ${dateLabel}`, clientId: existing.clientId, meetingDate: existing.meetingDate.toISOString() },
      ...requestContext(request),
    });

    return NextResponse.json({ success: true });
  }
);

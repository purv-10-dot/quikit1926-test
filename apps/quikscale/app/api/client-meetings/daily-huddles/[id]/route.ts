import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { updateDailyHuddleSchema } from "@/lib/schemas/clientMeetingsSchema";
import { writeAuditLog } from "@/lib/api/auditLog";

const withOrgAuth = withOrgAuthForModule("clientMeetings.dailyHuddle");

export const GET = withOrgAuth<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const row = await db.clientDailyHuddle.findFirst({
    where: { id: params.id, orgId, deletedAt: null },
    include: {
      client: { select: { id: true, name: true } },
      absentMembers: true,
      absentTeamMembers: true,
    },
  });
  if (!row) return NextResponse.json({ success: false, error: "Huddle not found" }, { status: 404 });

  return NextResponse.json({
    success: true,
    data: {
      ...row,
      meetingDate: row.meetingDate.toISOString(),
      absentUserIds: row.absentMembers.map(a => a.userId),
      absentClientMemberIds: row.absentTeamMembers.map(a => a.clientMemberId),
    },
  });
});

/** PUT — full update. Absence sets (both kinds) and notes fields replace atomically. */
export const PUT = withOrgAuth<{ id: string }>(async ({ orgId, userId }, request, { params }) => {
  const parsed = updateDailyHuddleSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json({ success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" }, { status: 400 });
  const d = parsed.data;

  const existing = await db.clientDailyHuddle.findFirst({
    where: { id: params.id, orgId, deletedAt: null },
    include: { absentMembers: true, absentTeamMembers: true },
  });
  if (!existing) return NextResponse.json({ success: false, error: "Huddle not found" }, { status: 404 });

  if (d.actualStartTime && d.actualEndTime && d.actualEndTime <= d.actualStartTime)
    return NextResponse.json({ success: false, error: "Actual end time must be after start time" }, { status: 400 });

  await db.$transaction(async tx => {
    await tx.clientDailyHuddle.update({
      where: { id: params.id },
      data: {
        meetingDate: d.meetingDate ? new Date(d.meetingDate) : undefined,
        callStatus: d.callStatus,
        actualStartTime: d.actualStartTime,
        actualEndTime:   d.actualEndTime,
        format1Status: d.format1Status,
        format2Status: d.format2Status,
        stuckCallStatus: d.stuckCallStatus,
        punctualityOverride: d.punctualityOverride,
        totalMembers: d.totalMembers,
        notes: d.notes,
        notesKPDashboard: d.notesKPDashboard,
        otherNotes: d.otherNotes,
        updatedBy: userId,
      },
    });
    if (d.absentUserIds !== undefined) {
      await tx.clientDailyHuddleAbsence.deleteMany({ where: { huddleId: params.id } });
      if (d.absentUserIds.length > 0) {
        await tx.clientDailyHuddleAbsence.createMany({
          data: d.absentUserIds.map(uid => ({ huddleId: params.id, userId: uid })),
        });
      }
    }
    if (d.absentClientMemberIds !== undefined) {
      await tx.clientDailyHuddleTeamAbsence.deleteMany({ where: { huddleId: params.id } });
      if (d.absentClientMemberIds.length > 0) {
        await tx.clientDailyHuddleTeamAbsence.createMany({
          data: d.absentClientMemberIds.map(cm => ({ huddleId: params.id, clientMemberId: cm })),
        });
      }
    }
  });

  await writeAuditLog({
    orgId, actorId: userId, action: "UPDATE",
    entityType: "DailyHuddle", entityId: params.id,
    newValues: { meetingDate: d.meetingDate, callStatus: d.callStatus },
  });

  return NextResponse.json({ success: true });
});

export const DELETE = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const existing = await db.clientDailyHuddle.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
  if (!existing) return NextResponse.json({ success: false, error: "Huddle not found" }, { status: 404 });
  await db.clientDailyHuddle.update({ where: { id: params.id }, data: { deletedAt: new Date(), updatedBy: userId } });
  await writeAuditLog({
    orgId, actorId: userId, action: "DELETE",
    entityType: "DailyHuddle", entityId: params.id,
    oldValues: { clientId: existing.clientId, meetingDate: existing.meetingDate.toISOString() },
  });
  return NextResponse.json({ success: true });
});

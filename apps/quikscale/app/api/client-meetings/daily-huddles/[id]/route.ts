import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { updateDailyHuddleSchema } from "@/lib/schemas/clientMeetingsSchema";
import { writeAuditLog } from "@/lib/api/auditLog";
import {
  audit,
  requestContext,
  classifyUpdateAction,
  diffFields,
  DAILY_HUDDLE_AUDIT_FIELDS,
} from "@/lib/audit";

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

  // ── Centralized audit (dual-write) ── full before/after diff across all
  // editable fields (the legacy log only stored date+status). callStatus →
  // STATUS pill; absent-member adds/removes resolved to names below.
  const beforeAbsent = existing.absentTeamMembers.map((a) => a.clientMemberId).sort();
  const keep = <T,>(v: T | undefined, prev: T): T => (v !== undefined ? v : prev);
  const before = {
    meetingDate: existing.meetingDate.toISOString(),
    callStatus: existing.callStatus,
    actualStartTime: existing.actualStartTime,
    actualEndTime: existing.actualEndTime,
    format1Status: existing.format1Status,
    format2Status: existing.format2Status,
    stuckCallStatus: existing.stuckCallStatus,
    punctualityOverride: existing.punctualityOverride,
    totalMembers: existing.totalMembers,
    notes: existing.notes,
    notesKPDashboard: existing.notesKPDashboard,
    otherNotes: existing.otherNotes,
    absentClientMemberIds: beforeAbsent,
  };
  const after = {
    meetingDate: d.meetingDate ? new Date(d.meetingDate).toISOString() : before.meetingDate,
    callStatus: keep(d.callStatus, before.callStatus),
    actualStartTime: keep(d.actualStartTime, before.actualStartTime),
    actualEndTime: keep(d.actualEndTime, before.actualEndTime),
    format1Status: keep(d.format1Status, before.format1Status),
    format2Status: keep(d.format2Status, before.format2Status),
    stuckCallStatus: keep(d.stuckCallStatus, before.stuckCallStatus),
    punctualityOverride: keep(d.punctualityOverride, before.punctualityOverride),
    totalMembers: keep(d.totalMembers, before.totalMembers),
    notes: keep(d.notes, before.notes),
    notesKPDashboard: keep(d.notesKPDashboard, before.notesKPDashboard),
    otherNotes: keep(d.otherNotes, before.otherNotes),
    absentClientMemberIds: (d.absentClientMemberIds !== undefined ? d.absentClientMemberIds : beforeAbsent).slice().sort(),
  };

  const auditChanges = diffFields(before, after, { include: DAILY_HUDDLE_AUDIT_FIELDS });
  // Absent-member add/remove: resolve ids → names (denormalized) so the
  // timeline reads "Absent Members + Alice − Bob".
  const absChange = auditChanges.find((c) => c.fieldName === "absentClientMemberIds");
  if (absChange) {
    const ids = [
      ...new Set([
        ...(((absChange.oldValue as string[] | null) ?? [])),
        ...(((absChange.newValue as string[] | null) ?? [])),
      ]),
    ];
    const mems = ids.length
      ? await db.clientMember.findMany({ where: { id: { in: ids }, orgId }, select: { id: true, name: true } })
      : [];
    const nameOf = new Map(mems.map((m) => [m.id, m.name]));
    const toNames = (v: unknown) =>
      Array.isArray(v) ? v.map((id) => nameOf.get(String(id)) ?? String(id)) : v;
    absChange.oldValue = toNames(absChange.oldValue);
    absChange.newValue = toNames(absChange.newValue);
  }

  await audit.log({
    entityType: "DAILY_HUDDLE",
    entityId: params.id,
    action: classifyUpdateAction(auditChanges.map((c) => c.fieldName)),
    actor: { userId, orgId, teamId: null },
    changes: auditChanges,
    skipIfNoChanges: true,
    ...requestContext(request),
  });

  return NextResponse.json({ success: true });
});

export const DELETE = withOrgAuth<{ id: string }>(async ({ orgId, userId }, request, { params }) => {
  const existing = await db.clientDailyHuddle.findFirst({
    where: { id: params.id, orgId, deletedAt: null },
    include: { client: { select: { name: true } } },
  });
  if (!existing) return NextResponse.json({ success: false, error: "Huddle not found" }, { status: 404 });

  // Optional (never required) reason — shown in the timeline if provided.
  const body = await request.json().catch(() => ({}));
  const reason =
    typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim() : null;

  await db.clientDailyHuddle.update({ where: { id: params.id }, data: { deletedAt: new Date(), updatedBy: userId } });
  await writeAuditLog({
    orgId, actorId: userId, action: "DELETE",
    entityType: "DailyHuddle", entityId: params.id,
    oldValues: { clientId: existing.clientId, meetingDate: existing.meetingDate.toISOString() },
    reason: reason ?? undefined,
  });

  // ── Centralized audit (dual-write) ── DELETE with a friendly identity
  // (client + date) so the timeline shows which huddle was removed.
  const dateLabel = existing.meetingDate.toISOString().slice(0, 10);
  await audit.log({
    entityType: "DAILY_HUDDLE",
    entityId: params.id,
    action: "DELETE",
    actor: { userId, orgId, teamId: null },
    reason,
    snapshot: { name: `${existing.client.name} · ${dateLabel}`, clientId: existing.clientId, meetingDate: existing.meetingDate.toISOString() },
    ...requestContext(request),
  });

  return NextResponse.json({ success: true });
});

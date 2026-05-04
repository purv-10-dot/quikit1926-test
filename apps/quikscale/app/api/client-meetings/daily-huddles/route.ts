import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { createDailyHuddleSchema } from "@/lib/schemas/clientMeetingsSchema";
import { writeAuditLog } from "@/lib/api/auditLog";

const withOrgAuth = withOrgAuthForModule("clientMeetings.dailyHuddle");

/**
 * GET /api/client-meetings/daily-huddles
 *   ?clientId=…&from=YYYY-MM-DD&to=YYYY-MM-DD&includeDeleted=true
 *
 * Returns rows with creator/updater name + initials + absence-member
 * ids (both legacy User-based and new ClientMember-based).
 */
export const GET = withOrgAuth(async ({ orgId }, request) => {
  const url = new URL(request.url);
  const clientId       = url.searchParams.get("clientId") ?? undefined;
  const from           = url.searchParams.get("from");
  const to             = url.searchParams.get("to");
  const includeDeleted = url.searchParams.get("includeDeleted") === "true";

  const where: Record<string, unknown> = { orgId, deletedAt: includeDeleted ? { not: null } : null };
  if (clientId) where.clientId = clientId;
  if (from || to) {
    const r: Record<string, Date> = {};
    if (from) r.gte = new Date(from);
    if (to) { const d = new Date(to); d.setUTCHours(23, 59, 59, 999); r.lte = d; }
    where.meetingDate = r;
  }

  const rows = await db.clientDailyHuddle.findMany({
    where,
    orderBy: { meetingDate: "desc" },
    include: {
      client: { select: { id: true, name: true } },
      absentMembers: true,
      absentTeamMembers: { include: { member: { select: { id: true, name: true } } } },
    },
  });

  // Resolve actor names/initials.
  const actorIds = [...new Set(rows.flatMap(r => [r.createdBy, r.updatedBy].filter(Boolean) as string[]))];
  const users = actorIds.length
    ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, firstName: true, lastName: true } })
    : [];
  const actorMap: Record<string, { name: string; initials: string }> = {};
  for (const u of users) actorMap[u.id] = {
    name: `${u.firstName} ${u.lastName}`.trim(),
    initials: `${u.firstName[0] ?? ""}${u.lastName[0] ?? ""}`.toUpperCase() || "??",
  };

  return NextResponse.json({
    success: true,
    data: rows.map((r, i) => ({
      id: r.id,
      displayId: i + 1,
      clientId: r.clientId,
      clientName: r.client.name,
      meetingDate: r.meetingDate.toISOString(),
      callStatus: r.callStatus,
      actualStartTime: r.actualStartTime,
      actualEndTime: r.actualEndTime,
      yesterdaysAchievements: r.format1Status === "YES",
      todaysPriority:         r.format2Status === "YES",
      stuckIssues:            r.stuckCallStatus === "YES",
      punctualityOverride: r.punctualityOverride,
      totalMembers: r.totalMembers,
      notes: r.notes,
      notesKPDashboard: r.notesKPDashboard,
      otherNotes: r.otherNotes,
      absentUserIds: r.absentMembers.map(a => a.userId),
      absentClientMemberIds: r.absentTeamMembers.map(a => a.clientMemberId),
      absentTeamMemberNames: r.absentTeamMembers.map(a => a.member.name),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      createdBy: r.createdBy,
      createdByName: actorMap[r.createdBy]?.name ?? "—",
      createdByInitials: actorMap[r.createdBy]?.initials ?? "??",
      updatedBy: r.updatedBy,
      updatedByName: r.updatedBy ? actorMap[r.updatedBy]?.name ?? "—" : null,
      updatedByInitials: r.updatedBy ? actorMap[r.updatedBy]?.initials ?? "??" : null,
    })),
  });
});

/** POST — create a daily huddle. Any active tenant member may call. */
export const POST = withOrgAuth(async ({ orgId, userId }, request) => {
  const parsed = createDailyHuddleSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json({ success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" }, { status: 400 });
  const d = parsed.data;

  const client = await db.client.findFirst({ where: { id: d.clientId, orgId, deletedAt: null } });
  if (!client) return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });

  if (d.actualStartTime && d.actualEndTime && d.actualEndTime <= d.actualStartTime)
    return NextResponse.json({ success: false, error: "Actual end time must be after start time" }, { status: 400 });

  const totalMembers = d.totalMembers || (await db.clientTeamMember.count({ where: { clientId: d.clientId } }));

  const created = await db.clientDailyHuddle.create({
    data: {
      orgId, clientId: d.clientId,
      meetingDate: new Date(d.meetingDate),
      callStatus: d.callStatus,
      actualStartTime: d.actualStartTime ?? null,
      actualEndTime:   d.actualEndTime ?? null,
      format1Status: d.format1Status,
      format2Status: d.format2Status,
      stuckCallStatus: d.stuckCallStatus,
      punctualityOverride: d.punctualityOverride,
      totalMembers,
      notes: d.notes ?? null,
      notesKPDashboard: d.notesKPDashboard ?? null,
      otherNotes: d.otherNotes ?? null,
      createdBy: userId,
      absentMembers:     { create: d.absentUserIds.map(uid => ({ userId: uid })) },
      absentTeamMembers: { create: d.absentClientMemberIds.map(cm => ({ clientMemberId: cm })) },
    },
  });

  await writeAuditLog({
    orgId, actorId: userId, action: "CREATE",
    entityType: "DailyHuddle", entityId: created.id,
    newValues: {
      clientId: d.clientId,
      meetingDate: d.meetingDate,
      callStatus: d.callStatus,
    },
  });

  return NextResponse.json({ success: true, data: { id: created.id } }, { status: 201 });
});

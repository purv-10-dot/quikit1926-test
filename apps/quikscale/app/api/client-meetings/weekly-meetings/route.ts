import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { createWeeklyMeetingSchema } from "@/lib/schemas/clientMeetingsSchema";
import { audit, requestContext } from "@/lib/audit";
import { parseSort, type SortDirection } from "@/lib/api/parseSort";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";

const withOrgAuth = withOrgAuthForModule("clientMeetings.weeklyMeeting");

const WEEKLY_SORT_WHITELIST = [
  "meetingDate",
  "client",
  "callStatus",
  "actualStartTime",
  "actualEndTime",
  "createdAt",
  "updatedAt",
] as const;

function mapWeeklySort(key: string, dir: SortDirection): Prisma.ClientWeeklyMeetingOrderByWithRelationInput {
  if (key === "client") return { client: { name: dir } };
  if (key === "callStatus") return { callStatus: dir };
  if (key === "actualStartTime") return { actualStartTime: dir };
  if (key === "actualEndTime") return { actualEndTime: dir };
  if (key === "createdAt") return { createdAt: dir };
  if (key === "updatedAt") return { updatedAt: dir };
  return { meetingDate: key === "meetingDate" ? dir : "desc" }; // default keeps legacy `meetingDate desc`
}

/**
 * GET /api/client-meetings/weekly-meetings?clientId=&from=&to=&includeDeleted=
 *     &sortBy=<col>&sortOrder=<asc|desc>
 *
 * Ordered newest first by default. By default soft-deleted rows are hidden.
 * When `includeDeleted=true` ONLY soft-deleted rows are returned — trash view.
 * `sortBy` is whitelist-enforced; unknown keys fall through to the legacy
 * `meetingDate desc` order.
 */
export const GET = withOrgAuth(async ({ orgId }, request) => {
  const url = new URL(request.url);
  const clientId = url.searchParams.get("clientId") ?? undefined;
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const includeDeleted = url.searchParams.get("includeDeleted") === "true";

  const where: Record<string, unknown> = {
    orgId,
    deletedAt: includeDeleted ? { not: null } : null,
  };
  if (clientId) where.clientId = clientId;
  if (from || to) {
    const range: Record<string, Date> = {};
    if (from) range.gte = new Date(from);
    if (to) {
      const d = new Date(to);
      d.setUTCHours(23, 59, 59, 999);
      range.lte = d;
    }
    where.meetingDate = range;
  }
  const search = (url.searchParams.get("search") ?? "").trim();
  const status = url.searchParams.get("status") || undefined;
  if (status) where.callStatus = status;
  if (search) {
    where.OR = [
      { client: { name: { contains: search, mode: "insensitive" } } },
      { notesKPDashboard: { contains: search, mode: "insensitive" } },
      { otherNotes: { contains: search, mode: "insensitive" } },
    ];
  }

  const { orderBy } = parseSort(request, WEEKLY_SORT_WHITELIST, mapWeeklySort);
  const { page, limit, skip, take } = parsePagination(request);
  const [rows, total] = await Promise.all([
    db.clientWeeklyMeeting.findMany({
      where,
      orderBy,
      skip,
      take,
      include: {
        client: { select: { id: true, name: true } },
        absentMembers: true,
        dashboardNAMembers: true,
        absentTeamMembers: {
          include: { member: { select: { id: true, name: true } } },
        },
        dashboardNATeamMembers: {
          include: { member: { select: { id: true, name: true } } },
        },
      },
    }),
    db.clientWeeklyMeeting.count({ where }),
  ]);

  // Resolve createdBy / updatedBy → name + initials for the table's audit columns.
  const actorIds = [...new Set(rows.flatMap((r) => [r.createdBy, r.updatedBy].filter(Boolean) as string[]))];
  const users = actorIds.length
    ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, firstName: true, lastName: true } })
    : [];
  const actorMap: Record<string, { name: string; initials: string }> = {};
  for (const u of users) {
    const name = `${u.firstName} ${u.lastName}`.trim() || "—";
    const initials = `${u.firstName[0] ?? ""}${u.lastName[0] ?? ""}`.toUpperCase() || "??";
    actorMap[u.id] = { name, initials };
  }

  const data = rows.map((r) => ({
      id: r.id,
      clientId: r.clientId,
      clientName: r.client.name,
      meetingDate: r.meetingDate.toISOString(),
      callStatus: r.callStatus,
      callStatusOther: r.callStatusOther,
      actualStartTime: r.actualStartTime,
      actualEndTime: r.actualEndTime,
      segmentTime1: r.segmentTime1,
      segmentTime2: r.segmentTime2,
      segmentTime3: r.segmentTime3,
      segmentTime4: r.segmentTime4,
      segmentTime5: r.segmentTime5,
      segmentTime6: r.segmentTime6,
      segmentTime7: r.segmentTime7,
      punctualityOverride: r.punctualityOverride,
      goodNewsSharing: r.goodNewsSharing,
      kpDashboard: r.kpDashboard,
      gaps: r.gaps,
      www: r.www,
      feedback: r.feedback,
      collectiveIntelligence: r.collectiveIntelligence,
      opspReview: r.opspReview,
      notesKPDashboard: r.notesKPDashboard,
      otherNotes: r.otherNotes,
      absentUserIds: r.absentMembers.map((a) => a.userId),
      dashboardNAUserIds: r.dashboardNAMembers.map((a) => a.userId),
      absentClientMemberIds: r.absentTeamMembers.map((a) => a.clientMemberId),
      absentClientMemberNames: r.absentTeamMembers.map((a) => a.member.name),
      dashboardNAClientMemberIds: r.dashboardNATeamMembers.map(
        (a) => a.clientMemberId
      ),
      dashboardNAClientMemberNames: r.dashboardNATeamMembers.map(
        (a) => a.member.name
      ),
      // Audit fields surfaced on the Weekly Meeting table.
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      createdBy: r.createdBy,
      createdByName: actorMap[r.createdBy]?.name ?? "—",
      createdByInitials: actorMap[r.createdBy]?.initials ?? "??",
      updatedBy: r.updatedBy,
      updatedByName: r.updatedBy ? (actorMap[r.updatedBy]?.name ?? null) : null,
      updatedByInitials: r.updatedBy ? (actorMap[r.updatedBy]?.initials ?? null) : null,
    }));

  return NextResponse.json(paginatedResponse(data, total, page, limit));
});

/** POST — create weekly meeting with absence + dashboardNA links + per-member scores. */
export const POST = withOrgAuth(async ({ orgId, userId }, request) => {
  const parsed = createWeeklyMeetingSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Invalid input",
      },
      { status: 400 }
    );
  const d = parsed.data;

  const client = await db.client.findFirst({
    where: { id: d.clientId, orgId, deletedAt: null },
  });
  if (!client)
    return NextResponse.json(
      { success: false, error: "Client not found" },
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

  // ── One-meeting-per-client-per-week rule ──────────────────────────────
  // A client can only have a single weekly meeting in any given calendar
  // week (Monday → Sunday). Check the bounds of the requested meetingDate
  // and reject the create if anything else lives in the same window.
  const meetingDate = new Date(d.meetingDate);
  const { start: weekStart, end: weekEnd } = weekBoundsMondayToSunday(meetingDate);
  const conflict = await db.clientWeeklyMeeting.findFirst({
    where: {
      orgId,
      clientId: d.clientId,
      deletedAt: null,
      meetingDate: { gte: weekStart, lte: weekEnd },
    },
    select: { id: true },
  });
  if (conflict) {
    return NextResponse.json(
      {
        success: false,
        error: `A weekly meeting for the selected client already exists between ${fmtDDMMYYYY(weekStart)} and ${fmtDDMMYYYY(weekEnd)}.`,
      },
      { status: 409 },
    );
  }

  const created = await db.clientWeeklyMeeting.create({
    data: {
      orgId,
      clientId: d.clientId,
      meetingDate: new Date(d.meetingDate),
      callStatus: d.callStatus,
      callStatusOther: d.callStatus === "OTHER" ? (d.callStatusOther?.trim() || null) : null,
      actualStartTime: d.actualStartTime ?? null,
      actualEndTime: d.actualEndTime ?? null,
      segmentTime1: d.segmentTime1 ?? null,
      segmentTime2: d.segmentTime2 ?? null,
      segmentTime3: d.segmentTime3 ?? null,
      segmentTime4: d.segmentTime4 ?? null,
      segmentTime5: d.segmentTime5 ?? null,
      segmentTime6: d.segmentTime6 ?? null,
      segmentTime7: d.segmentTime7 ?? null,
      punctualityOverride: d.punctualityOverride,
      goodNewsSharing: d.goodNewsSharing,
      kpDashboard: d.kpDashboard,
      gaps: d.gaps,
      www: d.www,
      feedback: d.feedback,
      collectiveIntelligence: d.collectiveIntelligence,
      opspReview: d.opspReview,
      notesKPDashboard: d.notesKPDashboard ?? null,
      otherNotes: d.otherNotes ?? null,
      createdBy: userId,
      absentMembers: {
        create: d.absentUserIds.map((uid) => ({ userId: uid })),
      },
      dashboardNAMembers: {
        create: d.dashboardNAUserIds.map((uid) => ({ userId: uid })),
      },
      absentTeamMembers: {
        create: d.absentClientMemberIds.map((cmid) => ({
          clientMemberId: cmid,
        })),
      },
      dashboardNATeamMembers: {
        create: d.dashboardNAClientMemberIds.map((cmid) => ({
          clientMemberId: cmid,
        })),
      },
    },
  });

  await db.clientWeeklyMeetingLog.create({
    data: {
      orgId,
      meetingId: created.id,
      action: "CREATE",
      newValue: JSON.stringify({
        clientId: created.clientId,
        meetingDate: created.meetingDate.toISOString(),
        callStatus: created.callStatus,
        callStatusOther: created.callStatusOther,
      }),
      changedBy: userId,
    },
  });

  // ── Centralized audit (dual-write) ── CREATE with the full post-state
  // snapshot so the Change History Create card shows all values.
  await audit.log({
    entityType: "WEEKLY_MEETING",
    entityId: created.id,
    action: "CREATE",
    actor: { userId, orgId, teamId: null },
    snapshot: {
      clientId: created.clientId,
      clientName: client.name,
      meetingDate: created.meetingDate.toISOString(),
      callStatus: created.callStatus,
      callStatusOther: created.callStatusOther,
      actualStartTime: created.actualStartTime,
      actualEndTime: created.actualEndTime,
      punctualityOverride: created.punctualityOverride,
      goodNewsSharing: created.goodNewsSharing,
      kpDashboard: created.kpDashboard,
      gaps: created.gaps,
      www: created.www,
      feedback: created.feedback,
      collectiveIntelligence: created.collectiveIntelligence,
      opspReview: created.opspReview,
      notesKPDashboard: created.notesKPDashboard,
      otherNotes: created.otherNotes,
      absentClientMemberIds: d.absentClientMemberIds,
      dashboardNAClientMemberIds: d.dashboardNAClientMemberIds,
    },
    ...requestContext(request),
  });

  return NextResponse.json(
    { success: true, data: { id: created.id } },
    { status: 201 }
  );
});

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Calendar-week bounds (Monday 00:00:00 → Sunday 23:59:59.999) for the date
 * that contains `d`. Used by the one-meeting-per-client-per-week guard.
 */
function weekBoundsMondayToSunday(d: Date): { start: Date; end: Date } {
  const day = d.getDay(); // 0 = Sun … 6 = Sat
  const daysFromMonday = day === 0 ? 6 : day - 1;
  const start = new Date(d);
  start.setDate(d.getDate() - daysFromMonday);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/** Format a Date as dd/MM/yyyy — matches the conflict-message format. */
function fmtDDMMYYYY(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}


/**
 * GET /api/client-meetings/weekly-meetings/export — Global Export for Weekly Meeting.
 *
 * Date-based interval: from/to ("YYYY-MM-DD") filter `meetingDate`. One row per
 * meeting. Scope shared with the list route via `buildClientMeetingWhere`.
 * Row-per-record export; the aggregate monthly metrics report
 * (/api/client-meetings/export/weekly*) is a separate, preserved feature.
 * Node runtime (ExcelJS + @react-pdf/renderer).
 */
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { buildClientMeetingWhere } from "@/lib/api/clientMeetingScopeQuery";
import { exportBaseSchema, dateRangeSchema, searchParamsToObject } from "@/lib/exports/exportParams";
import { weeklyMeetingExportColumns, type WeeklyMeetingExportRow } from "@/lib/exports/columns/weeklyMeetingExportColumns";
import { buildWorkbook } from "@/lib/exports/buildWorkbook";
import { fileResponse } from "@/lib/exports/exportResponse";

const withOrgAuth = withOrgAuthForModule("clientMeetings.weeklyMeeting");
const MAX_EXPORT_ROWS = 5000;

function fullName(u: { firstName: string | null; lastName: string | null } | null | undefined): string {
  if (!u) return "";
  return `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
}

export const GET = withOrgAuth(async ({ orgId }, req) => {
  const sp = req.nextUrl.searchParams;
  const obj = searchParamsToObject(sp);

  const base = exportBaseSchema.safeParse(obj);
  if (!base.success) return NextResponse.json({ success: false, error: "Invalid export params" }, { status: 400 });
  const date = dateRangeSchema.safeParse(obj);
  if (!date.success) return NextResponse.json({ success: false, error: "Invalid date range" }, { status: 400 });

  const where = buildClientMeetingWhere(orgId, {
    clientId: sp.get("clientId") || undefined,
    status: sp.get("status") || undefined,
    from: date.data.from,
    to: date.data.to,
    includeDeleted: sp.get("includeDeleted") === "true",
  });

  const meetings = await db.clientWeeklyMeeting.findMany({
    where,
    orderBy: { meetingDate: "desc" },
    take: MAX_EXPORT_ROWS,
    include: {
      client: { select: { name: true } },
      absentTeamMembers: { include: { member: { select: { name: true } } } },
      dashboardNATeamMembers: { include: { member: { select: { name: true } } } },
    },
  });

  const actorIds = new Set<string>();
  for (const m of meetings) {
    if (m.createdBy) actorIds.add(m.createdBy);
    if (m.updatedBy) actorIds.add(m.updatedBy);
  }
  const userMap = actorIds.size
    ? new Map(
        (
          await db.user.findMany({
            where: { id: { in: [...actorIds] } },
            select: { id: true, firstName: true, lastName: true },
          })
        ).map((u) => [u.id, u]),
      )
    : new Map<string, { firstName: string | null; lastName: string | null }>();

  const rows: WeeklyMeetingExportRow[] = meetings.map((m) => ({
    meetingDate: m.meetingDate ?? null,
    clientName: m.client?.name ?? "",
    callStatus: m.callStatus,
    absentMemberNames: m.absentTeamMembers.map((a) => a.member.name).join(", "),
    dashboardNANames: m.dashboardNATeamMembers.map((a) => a.member.name).join(", "),
    actualStartTime: m.actualStartTime,
    actualEndTime: m.actualEndTime,
    goodNewsSharing: m.goodNewsSharing,
    kpDashboard: m.kpDashboard,
    gaps: m.gaps,
    www: m.www,
    feedback: m.feedback,
    collectiveIntelligence: m.collectiveIntelligence,
    opspReview: m.opspReview,
    segmentTime1: m.segmentTime1,
    segmentTime2: m.segmentTime2,
    segmentTime3: m.segmentTime3,
    segmentTime4: m.segmentTime4,
    segmentTime5: m.segmentTime5,
    segmentTime6: m.segmentTime6,
    segmentTime7: m.segmentTime7,
    createdByName: m.createdBy ? fullName(userMap.get(m.createdBy)) : "",
    updatedByName: m.updatedBy ? fullName(userMap.get(m.updatedBy)) : "",
    createdAt: m.createdAt ?? null,
    updatedAt: m.updatedAt ?? null,
  }));

  const columns = weeklyMeetingExportColumns(base.data.columns);
  if (columns.length === 0) return NextResponse.json({ success: false, error: "Select at least one column." }, { status: 400 });

  const headers = columns.map((c) => c.label);
  const matrix = rows.map((r) => columns.map((c) => c.value(r)));

  const rangeBits = [date.data.from, date.data.to].filter(Boolean);
  const baseName = `WeeklyMeeting${rangeBits.length ? "-" + rangeBits.join("_to_") : ""}`;
  const dateSuffix = new Date().toISOString().slice(0, 10);

  const body = await buildWorkbook({ sheetName: "Weekly Meeting", headers, rows: matrix });
  return fileResponse(body, baseName, dateSuffix);
});

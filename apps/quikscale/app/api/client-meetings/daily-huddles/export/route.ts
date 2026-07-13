/**
 * GET /api/client-meetings/daily-huddles/export — Global Export for Daily Huddle.
 *
 * Date-based interval: from/to ("YYYY-MM-DD") filter `meetingDate`. One row per
 * huddle. Scope shared with the list route via `buildClientMeetingWhere`.
 * This is the row-per-record export; the aggregate monthly metrics report
 * (/api/client-meetings/export/daily*) is a separate, preserved feature.
 * Node runtime (ExcelJS + @react-pdf/renderer).
 */
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { buildClientMeetingWhere } from "@/lib/api/clientMeetingScopeQuery";
import { exportBaseSchema, dateRangeSchema, searchParamsToObject } from "@/lib/exports/exportParams";
import { dailyHuddleExportColumns, type DailyHuddleExportRow } from "@/lib/exports/columns/dailyHuddleExportColumns";
import { buildWorkbook } from "@/lib/exports/buildWorkbook";
import { fileResponse } from "@/lib/exports/exportResponse";

const withOrgAuth = withOrgAuthForModule("clientMeetings.dailyHuddle");
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

  const huddles = await db.clientDailyHuddle.findMany({
    where,
    orderBy: { meetingDate: "desc" },
    take: MAX_EXPORT_ROWS,
    include: {
      client: { select: { name: true } },
      absentTeamMembers: { include: { member: { select: { name: true } } } },
    },
  });

  const actorIds = new Set<string>();
  for (const h of huddles) {
    if (h.createdBy) actorIds.add(h.createdBy);
    if (h.updatedBy) actorIds.add(h.updatedBy);
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

  const rows: DailyHuddleExportRow[] = huddles.map((h) => ({
    meetingDate: h.meetingDate ?? null,
    clientName: h.client?.name ?? "",
    callStatus: h.callStatus,
    absentMemberNames: h.absentTeamMembers.map((a) => a.member.name).join(", "),
    actualStartTime: h.actualStartTime,
    actualEndTime: h.actualEndTime,
    yesterdaysAchievements: h.format1Status === "YES",
    todaysPriority: h.format2Status === "YES",
    stuckIssues: h.stuckCallStatus === "YES",
    notesKPDashboard: h.notesKPDashboard,
    otherNotes: h.otherNotes,
    createdByName: h.createdBy ? fullName(userMap.get(h.createdBy)) : "",
    updatedByName: h.updatedBy ? fullName(userMap.get(h.updatedBy)) : "",
    createdAt: h.createdAt ?? null,
    updatedAt: h.updatedAt ?? null,
  }));

  const columns = dailyHuddleExportColumns(base.data.columns);
  if (columns.length === 0) return NextResponse.json({ success: false, error: "Select at least one column." }, { status: 400 });

  const headers = columns.map((c) => c.label);
  const matrix = rows.map((r) => columns.map((c) => c.value(r)));

  const rangeBits = [date.data.from, date.data.to].filter(Boolean);
  const baseName = `DailyHuddle${rangeBits.length ? "-" + rangeBits.join("_to_") : ""}`;
  const dateSuffix = new Date().toISOString().slice(0, 10);

  const body = await buildWorkbook({ sheetName: "Daily Huddle", headers, rows: matrix });
  return fileResponse(body, baseName, dateSuffix);
});

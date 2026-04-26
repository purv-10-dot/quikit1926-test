import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { computeMemberPunchIn, calculateOverallFinalAverage } from "@/lib/services/clientMeetingsMath";
import { applyPctFill, applyHeader, workbookToBuffer, EXCEL_COLORS } from "@/lib/exports/clientMeetingsExcel";

const withTenantAuth = withTenantAuthForModule("clientMeetings.dashboard");

/**
 * POST /api/client-meetings/export/punch
 * Body: { clientId, year, month } — single-month member punch-in report.
 *
 * For every member on the client roster, emits meeting-date rows with 5 KPI
 * scores + a per-member Total row. Finishes with an overall "Total Average of
 * All Members" row (spec §7.9).
 */
export const POST = withTenantAuth(async ({ tenantId }, request) => {
  const body = await request.json();
  const clientId: string = body.clientId;
  const year: number = parseInt(body.year, 10);
  const month: number = parseInt(body.month, 10); // 1-indexed from UI
  if (!clientId || !Number.isFinite(year) || !Number.isFinite(month))
    return NextResponse.json({ success: false, error: "clientId, year, month required" }, { status: 400 });

  const client = await db.client.findFirst({
    where: { id: clientId, tenantId, deletedAt: null },
    include: {
      memberships: { where: { deletedAt: null }, include: { user: { select: { id: true, firstName: true, lastName: true } } } },
    },
  });
  if (!client) return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });

  const monthIdx = month - 1;
  const from  = new Date(Date.UTC(year, monthIdx, 1));
  const toEnd = new Date(Date.UTC(year, monthIdx + 1, 0, 23, 59, 59, 999));

  const meetings = await db.clientWeeklyMeeting.findMany({
    where: { tenantId, clientId, deletedAt: null, meetingDate: { gte: from, lte: toEnd } },
    include: { absentMembers: true, dashboardNAMembers: true },
    orderBy: { meetingDate: "asc" },
  });
  if (!meetings.length)
    return NextResponse.json({ success: false, error: `No meetings for ${year}-${String(month).padStart(2, "0")}` }, { status: 400 });

  const reports = client.memberships.map(m =>
    computeMemberPunchIn(
      meetings.map(mtg => ({
        id: mtg.id, meetingDate: mtg.meetingDate,
        absentUserIds: mtg.absentMembers.map(a => a.userId),
        dashboardNAUserIds: mtg.dashboardNAMembers.map(a => a.userId),
        memberScores: [] as const,
      })),
      { id: m.userId, name: `${m.user.firstName} ${m.user.lastName}`.trim() },
    ),
  );

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`${client.name} – Punch ${year}-${String(month).padStart(2, "0")}`);

  const header = ["Member Name", "Meeting Date", "KPI Weekly QTD", "KPI Color Coding", "Priority Notes", "Priority Start/End Date", "Priority Color", "Total Weekly Avg"];
  ws.addRow(header).eachCell(applyHeader);

  let rowIdx = 2;
  reports.forEach(rep => {
    if (!rep.weeks.length) return;
    const startRow = rowIdx;
    rep.weeks.forEach((w) => {
      const values = [w.kpiWeeklyQTD, w.kpiCoding, w.priorityNotes, w.priorityStartEndDate, w.priorityColor];
      const row = ws.addRow([
        rep.memberName, w.meetingDate,
        ...values.map(v => (typeof v === "number" ? `${v}%` : v)),
        `${rep.WeeklyTotalAverage}%`,
      ]);
      values.forEach((v, i) => {
        const cell = row.getCell(3 + i);
        if (typeof v === "number") applyPctFill(cell, v, true);
        else {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: v === "AB" ? EXCEL_COLORS.RED : EXCEL_COLORS.GRAY } };
          cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
          cell.alignment = { horizontal: "center" };
        }
      });
      applyPctFill(row.getCell(8), rep.WeeklyTotalAverage, true);
      rowIdx++;
    });
    const endRow = rowIdx - 1;
    if (endRow > startRow) {
      ws.mergeCells(startRow, 1, endRow, 1);
      ws.mergeCells(startRow, 8, endRow, 8);
    }
    // Total row per member
    const totRow = ws.addRow(["", "Total Average",
      `${rep.totals.kpiWeeklyQTD}%`, `${rep.totals.kpiCoding}%`,
      `${rep.totals.priorityNotes}%`, `${rep.totals.priorityStartEndDate}%`,
      `${rep.totals.priorityColor}%`, "",
    ]);
    totRow.eachCell(c => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EXCEL_COLORS.TOTAL } }; c.font = { bold: true }; c.alignment = { horizontal: "center" }; });
    rowIdx++;
  });

  // Overall row
  const overallAvg = calculateOverallFinalAverage(reports);
  const overallRow = ws.addRow(["Total Average of All Members", "", "", "", "", "", "", `${overallAvg}%`]);
  overallRow.eachCell(c => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EXCEL_COLORS.HEADER } }; c.font = { bold: true }; c.alignment = { horizontal: "center" }; });
  ws.mergeCells(rowIdx, 1, rowIdx, 7);

  ws.columns = [{ width: 28 }, { width: 14 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 20 }, { width: 16 }, { width: 16 }];

  const buf = await workbookToBuffer(wb);
  const filename = `${client.name}_${year}-${String(month).padStart(2, "0")}_Member_Punch.xlsx`;
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});

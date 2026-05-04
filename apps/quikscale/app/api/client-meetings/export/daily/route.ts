import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { calculateDailyMonthlyStats, previousMonths } from "@/lib/services/clientMeetingsMath";
import { applyPctFill, applyHeader, workbookToBuffer } from "@/lib/exports/clientMeetingsExcel";

const withOrgAuth = withOrgAuthForModule("clientMeetings.dashboard");

/**
 * POST /api/client-meetings/export/daily
 * Body: { clientId, monthsBack? }
 * Returns: xlsx blob with 6 metric rows × N month columns + Total Avg.
 */
export const POST = withOrgAuth(async ({ orgId }, request) => {
  const body = await request.json();
  const clientId: string = body.clientId;
  const monthsBack: number = body.monthsBack ?? 6;
  if (!clientId) return NextResponse.json({ success: false, error: "clientId required" }, { status: 400 });

  const client = await db.client.findFirst({ where: { id: clientId, orgId, deletedAt: null } });
  if (!client) return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });

  const months = previousMonths(new Date(), monthsBack);
  const from = new Date(Date.UTC(months[0].year, months[0].month, 1));
  const toEnd = new Date(Date.UTC(months[months.length - 1].year, months[months.length - 1].month + 1, 0, 23, 59, 59, 999));

  const huddles = await db.clientDailyHuddle.findMany({
    where: { orgId, clientId, deletedAt: null, meetingDate: { gte: from, lte: toEnd } },
    include: { absentMembers: true },
  });
  const stats = calculateDailyMonthlyStats(
    huddles.map(h => ({
      meetingDate: h.meetingDate, callStatus: h.callStatus,
      actualStartTime: h.actualStartTime, actualEndTime: h.actualEndTime,
      format1Status: h.format1Status, format2Status: h.format2Status, stuckCallStatus: h.stuckCallStatus,
      punctualityOverride: h.punctualityOverride,
      totalMembers: h.totalMembers, absentCount: h.absentMembers.length,
    })),
    months, client.dailyStartTime, client.dailyEndTime,
  );

  const metrics = [
    { key: "avgHeld", label: "Meeting Held" },
    { key: "avgPunctual", label: "Punctuality" },
    { key: "avgDurationFollowed", label: "Duration Followed" },
    { key: "avgFormat", label: "Format Followed" },
    { key: "avgAttendance", label: "Attendance" },
    { key: "avgStuckCalls", label: "Stuck Issue Called Out" },
  ] as const;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`${client.name} – Daily`);

  const header = ["Sr No.", "Metric Description", ...months.map(m => `${new Date(Date.UTC(m.year, m.month, 1)).toLocaleString("en-US", { month: "short" })} ${String(m.year).slice(-2)}`), "Total Avg"];
  ws.addRow(header).eachCell(applyHeader);

  metrics.forEach((m, i) => {
    const row = ws.addRow([
      i + 1, m.label,
      ...stats.map(s => `${s[m.key]}%`),
      `${Math.round(stats.reduce((a, s) => a + (s.isUpdate ? s[m.key] as number : 0), 0) / Math.max(1, stats.filter(s => s.isUpdate).length))}%`,
    ]);
    row.getCell(1).alignment = { horizontal: "center" };
    row.getCell(2).font = { bold: true };
    stats.forEach((s, idx) => {
      applyPctFill(row.getCell(3 + idx), s[m.key] as number, s.isUpdate);
    });
    const totalVal = Math.round(stats.reduce((a, s) => a + (s.isUpdate ? s[m.key] as number : 0), 0) / Math.max(1, stats.filter(s => s.isUpdate).length));
    applyPctFill(row.getCell(3 + stats.length), totalVal, true);
  });

  // Total row
  const totalRow = ws.addRow(["", "Total", ...stats.map(s => `${s.Total}%`), `${Math.round(stats.reduce((a, s) => a + (s.isUpdate ? s.Total : 0), 0) / Math.max(1, stats.filter(s => s.isUpdate).length))}%`]);
  totalRow.getCell(2).font = { bold: true };
  stats.forEach((s, idx) => applyPctFill(totalRow.getCell(3 + idx), s.Total, s.isUpdate));

  ws.columns = [{ width: 8 }, { width: 30 }, ...months.map(() => ({ width: 12 })), { width: 14 }];

  const buf = await workbookToBuffer(wb);
  const filename = `${client.name}_${from.toISOString().slice(0, 7)}_to_${toEnd.toISOString().slice(0, 7)}_Daily.xlsx`;
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});

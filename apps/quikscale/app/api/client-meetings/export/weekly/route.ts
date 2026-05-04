import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { calculateWeeklyMonthlyStats, previousMonths } from "@/lib/services/clientMeetingsMath";
import { applyPctFill, applyHeader, workbookToBuffer } from "@/lib/exports/clientMeetingsExcel";

const withOrgAuth = withOrgAuthForModule("clientMeetings.dashboard");

/**
 * POST /api/client-meetings/export/weekly
 * Body: { clientId, monthsBack? }
 * Returns: xlsx blob with 9 metric rows (spec §7.10) × months + Total Avg.
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

  const meetings = await db.clientWeeklyMeeting.findMany({
    where: { orgId, clientId, deletedAt: null, meetingDate: { gte: from, lte: toEnd } },
    include: { absentMembers: true, dashboardNAMembers: true },
  });
  const stats = calculateWeeklyMonthlyStats(
    meetings.map(m => ({
      meetingDate: m.meetingDate, callStatus: m.callStatus,
      actualStartTime: m.actualStartTime, actualEndTime: m.actualEndTime,
      goodNewsSharing: m.goodNewsSharing, kpDashboard: m.kpDashboard,
      www: m.www, feedback: m.feedback,
      collectiveIntelligence: m.collectiveIntelligence, gaps: m.gaps,
      opspReview: m.opspReview, punctualityOverride: ("NA" as const),
      totalMembers: 0, absentCount: m.absentMembers.length,
      memberScores: [] as const,
    })),
    months, client.weeklyStartTime, client.weeklyEndTime,
  );

  const metrics = [
    { key: "avgHeld",             label: "Meeting Held" },
    { key: "avgPunctual",         label: "Punctuality" },
    { key: "avgDurationFollowed", label: "Duration Followed" },
    { key: "avgAuality",          label: "Dashboard Quality" },
    { key: "avgKP",               label: "K&P Gaps Discussed" },
    { key: "avgWWW",              label: "WWW Review" },
    { key: "avgEF",               label: "Employee Feedback" },
    { key: "avgCI",               label: "Collective Intelligence" },
    { key: "avgAttendance",       label: "Attendance" },
  ] as const;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`${client.name} – Weekly`);

  const header = ["Sr No.", "Metric Description", ...months.map(m => `${new Date(Date.UTC(m.year, m.month, 1)).toLocaleString("en-US", { month: "short" })} ${String(m.year).slice(-2)}`), "Total Avg"];
  ws.addRow(header).eachCell(applyHeader);

  metrics.forEach((m, i) => {
    const colTotal = Math.round(stats.reduce((a, s) => a + (s.isUpdate ? s[m.key] as number : 0), 0) / Math.max(1, stats.filter(s => s.isUpdate).length));
    const row = ws.addRow([i + 1, m.label, ...stats.map(s => `${s[m.key]}%`), `${colTotal}%`]);
    row.getCell(1).alignment = { horizontal: "center" };
    row.getCell(2).font = { bold: true };
    stats.forEach((s, idx) => applyPctFill(row.getCell(3 + idx), s[m.key] as number, s.isUpdate));
    applyPctFill(row.getCell(3 + stats.length), colTotal, true);
  });

  const totalRow = ws.addRow(["", "Total", ...stats.map(s => `${s.Total}%`),
    `${Math.round(stats.reduce((a, s) => a + (s.isUpdate ? s.Total : 0), 0) / Math.max(1, stats.filter(s => s.isUpdate).length))}%`]);
  totalRow.getCell(2).font = { bold: true };
  stats.forEach((s, idx) => applyPctFill(totalRow.getCell(3 + idx), s.Total, s.isUpdate));

  ws.columns = [{ width: 8 }, { width: 30 }, ...months.map(() => ({ width: 12 })), { width: 14 }];

  const buf = await workbookToBuffer(wb);
  const filename = `${client.name}_${from.toISOString().slice(0, 7)}_to_${toEnd.toISOString().slice(0, 7)}_Weekly.xlsx`;
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});

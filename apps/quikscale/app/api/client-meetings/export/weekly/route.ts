import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { calculateWeeklyMonthlyStats, monthsInRange, parseYearMonth, parseYearMonthNum } from "@/lib/services/clientMeetingsMath";
import { applyPctFill, applyHeader, workbookToBuffer } from "@/lib/exports/clientMeetingsExcel";
import { WEEKLY_METRICS } from "@/lib/constants/clientMeetingsMetrics";

const withOrgAuth = withOrgAuthForModule("clientMeetings.dashboard");

/**
 * POST /api/client-meetings/export/weekly
 * Body: { clientId, monthsBack? }
 * Returns: xlsx blob with 9 metric rows (spec §7.10) × months + Total Avg.
 */
export const POST = withOrgAuth(async ({ orgId }, request) => {
  const body = await request.json();
  const clientId: string = body.clientId;
  if (!clientId) return NextResponse.json({ success: false, error: "clientId required" }, { status: 400 });

  // Build the month list strictly from the selected From→To range. The modal
  // sends `from`/`to` as "YYYY-MM" (and `year`/`month` derived from `to`).
  // Previously this route ignored them and always exported the rolling last 6
  // months, so a March→April request leaked Jan/Feb/May/Jun columns.
  const toYM = parseYearMonth(body.to) ?? parseYearMonthNum(body.year, body.month);
  if (!toYM)
    return NextResponse.json({ success: false, error: "A valid month range is required." }, { status: 400 });
  const fromYM = parseYearMonth(body.from) ?? toYM; // missing "From" → single month
  const months = monthsInRange(fromYM, toYM);

  // Pull the client + its active roster so we can size the attendance
  // denominator. The dashboard route does the same; the export route
  // previously hard-coded `totalMembers: 0` (always 0% attendance) and
  // only counted User-keyed absents (missing the ClientMember-keyed list
  // the form actually writes to).
  const client = await db.client.findFirst({
    where: { id: clientId, orgId, deletedAt: null },
    include: {
      teamMembers: {
        include: { member: { select: { deletedAt: true } } },
      },
    },
  });
  if (!client) return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
  // Roster size = active client team members (mirrors the dashboard route).
  const rosterSize = client.teamMembers.filter(tm => !tm.member.deletedAt).length;

  const from = new Date(Date.UTC(months[0].year, months[0].month, 1));
  const toEnd = new Date(Date.UTC(months[months.length - 1].year, months[months.length - 1].month + 1, 0, 23, 59, 59, 999));

  const meetings = await db.clientWeeklyMeeting.findMany({
    where: { orgId, clientId, deletedAt: null, meetingDate: { gte: from, lte: toEnd } },
    include: {
      absentMembers: true,
      dashboardNAMembers: true,
      absentTeamMembers: true,
      dashboardNATeamMembers: true,
      // memberScores power the "Quality of the dashboards" metric — without
      // these the export would render Quality as 0% even when the dashboard
      memberScores: true,
    },
  });

  // No-data guard — bail out before generating a blank workbook so the
  // user gets a clear error instead of a 0%-everywhere xlsx download.
  if (meetings.length === 0) {
    return NextResponse.json(
      { success: false, error: "There is no data in the selected range." },
      { status: 404 },
    );
  }
  const stats = calculateWeeklyMonthlyStats(
    meetings.map(m => ({
      meetingDate: m.meetingDate, callStatus: m.callStatus,
      actualStartTime: m.actualStartTime, actualEndTime: m.actualEndTime,
      goodNewsSharing: m.goodNewsSharing, kpDashboard: m.kpDashboard,
      www: m.www, feedback: m.feedback,
      collectiveIntelligence: m.collectiveIntelligence, gaps: m.gaps,
      opspReview: m.opspReview, punctualityOverride: ("NA" as const),
      // Same attendance math as the dashboard route:
      //   - denominator = full roster size (NA members count as present)
      //   - absentCount = User-keyed + ClientMember-keyed absences combined
      // See bugsResolve.md #19.
      totalMembers: rosterSize,
      absentCount: m.absentMembers.length + m.absentTeamMembers.length,
      memberScores: m.memberScores.map(s => ({
        userId: s.clientMemberId,
        kpiWeeklyQTD: s.kpiWeeklyQTD,
        kpiCoding: s.kpiCoding,
        priorityNotes: s.priorityNotes,
        priorityStartEndDate: s.priorityStartEndDate,
        priorityColor: s.priorityColor,
      })),
    })),
    months, client.weeklyStartTime, client.weeklyEndTime,
  );

  // Full metric descriptions — shared with the dashboard so labels never drift.
  const metrics = WEEKLY_METRICS;

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

  // Metric Description (col B) holds full labels — widen so the longest
  // ("Active discussion on K&P achivement gaps & action plan") shows in full.
  ws.columns = [{ width: 8 }, { width: 66 }, ...months.map(() => ({ width: 12 })), { width: 14 }];

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

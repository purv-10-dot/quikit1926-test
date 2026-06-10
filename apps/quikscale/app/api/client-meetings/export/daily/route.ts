import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { calculateDailyMonthlyStats, monthsInRange, parseYearMonth, parseYearMonthNum } from "@/lib/services/clientMeetingsMath";
import { applyPctFill, applyHeader, workbookToBuffer } from "@/lib/exports/clientMeetingsExcel";
import { DAILY_METRICS } from "@/lib/constants/clientMeetingsMetrics";

const withOrgAuth = withOrgAuthForModule("clientMeetings.dashboard");

/**
 * POST /api/client-meetings/export/daily
 * Body: { clientId, monthsBack? }
 * Returns: xlsx blob with 6 metric rows × N month columns + Total Avg.
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

  const client = await db.client.findFirst({
    where: { id: clientId, orgId, deletedAt: null },
    include: { teamMembers: { include: { member: { select: { deletedAt: true } } } } },
  });
  if (!client) return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });

  // Canonical denominator / fallback for huddles saved before `totalMembers`
  // was snapshotted — matches the dashboard route exactly.
  const rosterSize = client.teamMembers.filter(tm => !tm.member.deletedAt).length;

  const from = new Date(Date.UTC(months[0].year, months[0].month, 1));
  const toEnd = new Date(Date.UTC(months[months.length - 1].year, months[months.length - 1].month + 1, 0, 23, 59, 59, 999));

  const huddles = await db.clientDailyHuddle.findMany({
    where: { orgId, clientId, deletedAt: null, meetingDate: { gte: from, lte: toEnd } },
    // Both rosters: legacy User-based (`absentMembers`) and external Client
    // Member (`absentTeamMembers`). The Daily Huddle form writes absences to
    // `absentTeamMembers`, so omitting it (the old bug) under-counted absences
    // and inflated Attendance vs the dashboard.
    include: { absentMembers: true, absentTeamMembers: true },
  });

  // No-data guard — return a 404 instead of a blank workbook so the user
  // sees an explicit error message rather than a 0%-everywhere download.
  if (huddles.length === 0) {
    return NextResponse.json(
      { success: false, error: "There is no data in the selected range." },
      { status: 404 },
    );
  }

  const stats = calculateDailyMonthlyStats(
    huddles.map(h => ({
      meetingDate: h.meetingDate, callStatus: h.callStatus,
      actualStartTime: h.actualStartTime, actualEndTime: h.actualEndTime,
      format1Status: h.format1Status, format2Status: h.format2Status, stuckCallStatus: h.stuckCallStatus,
      punctualityOverride: h.punctualityOverride,
      // Match the dashboard route's mapping exactly so the exported numbers
      // equal the on-screen ones: roster-size fallback + union of both absence
      // rosters.
      totalMembers: h.totalMembers > 0 ? h.totalMembers : rosterSize,
      absentCount: h.absentMembers.length + h.absentTeamMembers.length,
    })),
    months, client.dailyStartTime, client.dailyEndTime,
  );

  // Full metric descriptions — shared with the dashboard so labels never drift.
  const metrics = DAILY_METRICS;

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

  // Metric Description (col B) holds full labels up to ~64 chars — widen so the
  // longest ("Avg. % of Calls where call duration + time per member was
  // followed") shows in full instead of being clipped.
  ws.columns = [{ width: 8 }, { width: 66 }, ...months.map(() => ({ width: 12 })), { width: 14 }];

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

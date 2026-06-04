import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { computeMemberPunchIn, calculateOverallFinalAverage } from "@/lib/services/clientMeetingsMath";
import { applyPlainCell, applyHeader, workbookToBuffer, EXCEL_COLORS } from "@/lib/exports/clientMeetingsExcel";

const withOrgAuth = withOrgAuthForModule("clientMeetings.dashboard");

/**
 * POST /api/client-meetings/export/punch
 * Body: { clientId, year, month } — single-month member punch-in report.
 *
 * For every member on the client roster, emits meeting-date rows with 5 KPI
 * scores + a per-member Total row. Finishes with an overall "Total Average of
 * All Members" row (spec §7.9).
 */
export const POST = withOrgAuth(async ({ orgId }, request) => {
  const body = await request.json();
  const clientId: string = body.clientId;
  const year: number = parseInt(body.year, 10);
  const month: number = parseInt(body.month, 10); // 1-indexed from UI
  if (!clientId || !Number.isFinite(year) || !Number.isFinite(month))
    return NextResponse.json({ success: false, error: "clientId, year, month required" }, { status: 400 });

  // ── Roster ──
  // The per-member KPI scores entered on the Weekly Meeting *Update* tab live
  // in `ClientWeeklyMemberScore`, which is keyed on `clientMemberId` (the
  // standalone `ClientMember` entity — external members the client invites),
  // NOT on `User.id`. So we build the roster from `Client.teamMembers` →
  // `ClientTeamMember` → `ClientMember`, not from `Client.memberships`
  // (tenant users). Same goes for the AB / NA flags: the Update tab writes to
  // `ClientWeeklyMeetingTeamAbsence` / `…TeamDashboardNA`, not the User-keyed
  // legacy tables.
  const client = await db.client.findFirst({
    where: { id: clientId, orgId, deletedAt: null },
    include: {
      teamMembers: {
        include: { member: { select: { id: true, name: true, deletedAt: true } } },
      },
    },
  });
  if (!client) return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });

  const roster = client.teamMembers
    .map((tm) => tm.member)
    .filter((m) => !m.deletedAt);

  const monthIdx = month - 1;
  const from  = new Date(Date.UTC(year, monthIdx, 1));
  const toEnd = new Date(Date.UTC(year, monthIdx + 1, 0, 23, 59, 59, 999));

  const meetings = await db.clientWeeklyMeeting.findMany({
    where: { orgId, clientId, deletedAt: null, meetingDate: { gte: from, lte: toEnd } },
    include: {
      // ClientMember-keyed companions (the ones the Update tab writes to).
      absentTeamMembers:      true,
      dashboardNATeamMembers: true,
      memberScores:           true,
    },
    orderBy: { meetingDate: "asc" },
  });
  // No-data guard — same message as the daily / weekly exports so the
  // client-side handler can show one consistent error.
  if (!meetings.length)
    return NextResponse.json(
      { success: false, error: "There is no data in the selected range." },
      { status: 404 },
    );

  // `computeMemberPunchIn` keys on a string `member.id` — it doesn't care
  // whether that id is a `User.id` or a `ClientMember.id`. We pass the
  // ClientMember.id consistently across the roster, absences, and scores.
  const reports = roster.map((m) =>
    computeMemberPunchIn(
      meetings.map((mtg) => ({
        id: mtg.id,
        meetingDate: mtg.meetingDate,
        absentUserIds:      mtg.absentTeamMembers.map((a) => a.clientMemberId),
        dashboardNAUserIds: mtg.dashboardNATeamMembers.map((a) => a.clientMemberId),
        memberScores: mtg.memberScores.map((s) => ({
          userId: s.clientMemberId,
          kpiWeeklyQTD:         s.kpiWeeklyQTD,
          kpiCoding:            s.kpiCoding,
          priorityNotes:        s.priorityNotes,
          priorityStartEndDate: s.priorityStartEndDate,
          priorityColor:        s.priorityColor,
        })),
      })),
      { id: m.id, name: m.name },
    ),
  );

  // Exclude members who were AB or NA in every meeting this month — they
  // would otherwise show up as 0%-everywhere rows and drag the bottom
  // "Total Average of All Members" down. A single numeric score in any
  // meeting is enough to keep them in.
  const eligibleReports = reports.filter((rep) =>
    rep.weeks.some((w) => typeof w.kpiWeeklyQTD === "number"),
  );
  if (!eligibleReports.length) {
    return NextResponse.json(
      { success: false, error: "There is no data in the selected range." },
      { status: 404 },
    );
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`${client.name} – Punch ${year}-${String(month).padStart(2, "0")}`);

  const header = ["Member Name", "Meeting Date", "KPI Weekly QTD", "KPI Color Coding", "Priority Notes", "Priority Start/End Date", "Priority Color", "Total Weekly Avg"];
  ws.addRow(header).eachCell(applyHeader);

  let rowIdx = 2;
  eligibleReports.forEach((rep, repIdx) => {
    if (!rep.weeks.length) return;

    // Visual separator before every member block except the first one.
    if (repIdx > 0) {
      ws.addRow([]);
      rowIdx++;
    }

    const startRow = rowIdx;

    // ── Meeting rows ──
    // Col 1 (Member Name) and col 8 (Total Weekly Avg) get the value only on
    // the FIRST row of the block; the merge later collapses them across the
    // whole block (meetings + Total Average row) so they read as one cell.
    rep.weeks.forEach((w, weekIdx) => {
      const values = [w.kpiWeeklyQTD, w.kpiCoding, w.priorityNotes, w.priorityStartEndDate, w.priorityColor];
      const row = ws.addRow([
        weekIdx === 0 ? rep.memberName : "",
        w.meetingDate,
        ...values.map((v) => (typeof v === "number" ? `${v}%` : v)),
        weekIdx === 0 ? `${rep.WeeklyTotalAverage}%` : "",
      ]);
      // Colour-free data cells (per user request) — numbers and the AB / NA
      // labels all render as plain centered text, no traffic-light fills.
      values.forEach((_v, i) => {
        applyPlainCell(row.getCell(3 + i));
      });
      if (weekIdx === 0) {
        // Keep the per-member "Total Weekly Avg" box lightly shaded (no
        // traffic-light colour) so the block still reads as a summary.
        const totCell = row.getCell(8);
        totCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EXCEL_COLORS.TOTAL } };
        totCell.font = { bold: true };
        totCell.alignment = { horizontal: "center", vertical: "middle" };
      }
      rowIdx++;
    });

    // ── Total Average row (inside the member block) ──
    // Cols 1 + 8 left blank — they'll be merged with the meeting rows above.
    const totRow = ws.addRow([
      "",
      "Total Average",
      `${rep.totals.kpiWeeklyQTD}%`,
      `${rep.totals.kpiCoding}%`,
      `${rep.totals.priorityNotes}%`,
      `${rep.totals.priorityStartEndDate}%`,
      `${rep.totals.priorityColor}%`,
      "",
    ]);
    // Style cols 2-7 only — cols 1+8 are part of the merge above and will
    // inherit the top-left cell's style.
    for (let c = 2; c <= 7; c++) {
      const cell = totRow.getCell(c);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EXCEL_COLORS.TOTAL } };
      cell.font = { bold: true };
      cell.alignment = { horizontal: "center" };
    }
    rowIdx++;

    // ── Merge col 1 (Member Name) and col 8 (Total Weekly Avg) across the
    // entire block (meetings + Total Average). Always fires — even a member
    // with just one meeting still gets a 2-row merge so the layout stays
    // consistent across the workbook.
    const endRow = rowIdx - 1; // index of the Total Average row
    ws.mergeCells(startRow, 1, endRow, 1);
    ws.mergeCells(startRow, 8, endRow, 8);
    // Re-center the merged Member Name cell so it reads cleanly across rows.
    const mergedName = ws.getCell(startRow, 1);
    mergedName.font = { bold: true };
    mergedName.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });

  // Overall row — averages only the eligible (present-at-least-once) members,
  // matching the row set rendered above.
  const overallAvg = calculateOverallFinalAverage(eligibleReports);
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

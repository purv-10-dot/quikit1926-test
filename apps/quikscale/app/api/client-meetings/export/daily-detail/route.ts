import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import {
  buildDetailExport,
  sanitizeFilename,
  stripHtml,
  type DetailExportColumn,
} from "@/lib/exports/meetingDetailExcel";

const withOrgAuth = withOrgAuthForModule("clientMeetings.dailyHuddle");

interface DailyExportRow {
  meetingDate: string;
  callStatus: string;
  clientName: string;
  absentMembers: string;
  actualStartTime: string;
  actualEndTime: string;
  format1Status: string;
  format2Status: string;
  stuckCallStatus: string;
  notesKPDashboard: string;
  otherNotes: string;
  totalMembers: number;
  presentMemberCount: number;
  absentMemberCount: number;
  presentPercentage: string;
}

/**
 * POST /api/client-meetings/export/daily-detail
 * Body: { clientId: string, from: "YYYY-MM-DD", to: "YYYY-MM-DD" }
 *
 * Returns: xlsx blob — one row per daily huddle in the date range, with
 * Client Master roster size driving the Total / Present / Absent counts.
 */
export const POST = withOrgAuth(async ({ orgId }, request) => {
  const body = await request.json().catch(() => ({}));
  const clientId: string | undefined = body.clientId;
  const from: string | undefined = body.from;
  const to: string | undefined = body.to;

  if (!clientId || !from || !to) {
    return NextResponse.json(
      { success: false, error: "clientId, from, and to are required" },
      { status: 400 },
    );
  }

  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T23:59:59.999Z`);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return NextResponse.json(
      { success: false, error: "Invalid from/to date" },
      { status: 400 },
    );
  }

  const client = await db.client.findFirst({
    where: { id: clientId, orgId, deletedAt: null },
    include: {
      teamMembers: {
        include: { member: { select: { deletedAt: true } } },
      },
    },
  });
  if (!client) {
    return NextResponse.json(
      { success: false, error: "Client not found" },
      { status: 404 },
    );
  }
  const totalMembers = client.teamMembers.filter(
    (tm) => !tm.member.deletedAt,
  ).length;

  const huddles = await db.clientDailyHuddle.findMany({
    where: {
      orgId,
      clientId,
      deletedAt: null,
      meetingDate: { gte: fromDate, lte: toDate },
    },
    include: {
      absentMembers: {
        include: { user: { select: { firstName: true, lastName: true } } },
      },
      absentTeamMembers: {
        include: { member: { select: { name: true } } },
      },
    },
    orderBy: { meetingDate: "asc" },
  });

  const rows: DailyExportRow[] = huddles.map((m) => {
    const absentMemberCount =
      m.absentMembers.length + m.absentTeamMembers.length;
    const presentMemberCount = Math.max(0, totalMembers - absentMemberCount);
    const presentPercentage =
      totalMembers > 0
        ? `${((presentMemberCount / totalMembers) * 100).toFixed(2)}%`
        : "0.00%";

    const absentNames = [
      ...m.absentTeamMembers.map((x) => x.member.name.trim()),
      ...m.absentMembers.map((x) =>
        `${x.user.firstName} ${x.user.lastName}`.trim(),
      ),
    ].join(", ");

    return {
      meetingDate: m.meetingDate.toISOString().slice(0, 10),
      callStatus: m.callStatus,
      clientName: client.name,
      absentMembers: absentNames,
      actualStartTime: m.actualStartTime ?? "",
      actualEndTime: m.actualEndTime ?? "",
      format1Status: m.format1Status,
      format2Status: m.format2Status,
      stuckCallStatus: m.stuckCallStatus,
      notesKPDashboard: stripHtml(m.notesKPDashboard),
      otherNotes: stripHtml(m.otherNotes),
      totalMembers,
      presentMemberCount,
      absentMemberCount,
      presentPercentage,
    };
  });

  const columns: DetailExportColumn<DailyExportRow>[] = [
    { label: "Meeting Date",                value: (r) => r.meetingDate, width: 12 },
    { label: "Call Status",                 value: (r) => r.callStatus, width: 12 },
    { label: "Client Name",                 value: (r) => r.clientName, width: 18 },
    { label: "Absent Members",              value: (r) => r.absentMembers, width: 24 },
    { label: "Actual Start Time",           value: (r) => r.actualStartTime, width: 14 },
    { label: "Actual End Time",             value: (r) => r.actualEndTime, width: 14 },
    { label: "Yesterday's Achievements",    value: (r) => r.format1Status, width: 18 },
    { label: "Today's Priority",            value: (r) => r.format2Status, width: 16 },
    { label: "Stuck Issues",                value: (r) => r.stuckCallStatus, width: 14 },
    { label: "Notes K&P Dashboard",         value: (r) => r.notesKPDashboard, width: 32 },
    { label: "Other Notes",                 value: (r) => r.otherNotes, width: 32 },
    { label: "Total Members",               value: (r) => r.totalMembers, width: 14 },
    { label: "Present Member Count",        value: (r) => r.presentMemberCount, width: 16 },
    { label: "Absent Member Count",         value: (r) => r.absentMemberCount, width: 16 },
    { label: "Present Percentage (%)",      value: (r) => r.presentPercentage, width: 18 },
  ];

  const buf = await buildDetailExport({
    clientName: client.name,
    plannedStartTime: client.dailyStartTime,
    plannedEndTime: client.dailyEndTime,
    columns,
    rows,
  });

  const fromMonth = from.slice(0, 7);
  const toMonth = to.slice(0, 7);
  const filename = `${sanitizeFilename(client.name)}_${fromMonth}_to_${toMonth}_Daily HuddleExport.xlsx`;

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});

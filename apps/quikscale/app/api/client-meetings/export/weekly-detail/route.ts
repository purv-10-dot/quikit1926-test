import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import {
  buildDetailExport,
  sanitizeFilename,
  stripHtml,
  type DetailExportColumn,
} from "@/lib/exports/meetingDetailExcel";

const withOrgAuth = withOrgAuthForModule("clientMeetings.weeklyMeeting");

interface WeeklyExportRow {
  meetingDate: string;
  callStatus: string;
  clientName: string;
  absentMembers: string;
  dashboardNAMembers: string;
  actualStartTime: string;
  actualEndTime: string;
  goodNewsSharing: string;
  segmentTime1: string;
  kpDashboard: string;
  segmentTime2: string;
  gaps: string;
  segmentTime3: string;
  www: string;
  segmentTime4: string;
  feedback: string;
  segmentTime5: string;
  collectiveIntelligence: string;
  segmentTime6: string;
  opspReview: string;
  segmentTime7: string;
  notesKPDashboard: string;
  otherNotes: string;
  totalMembers: number;
  presentMemberCount: number;
  absentMemberCount: number;
  presentPercentage: string;
}

/**
 * POST /api/client-meetings/export/weekly-detail
 * Body: { clientId: string, from: "YYYY-MM-DD", to: "YYYY-MM-DD" }
 *
 * Returns: xlsx blob — one row per weekly meeting in the date range, with
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

  // Client + active roster — roster size becomes the Total Members denominator.
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

  const meetings = await db.clientWeeklyMeeting.findMany({
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
      dashboardNAMembers: {
        include: { user: { select: { firstName: true, lastName: true } } },
      },
      absentTeamMembers: {
        include: { member: { select: { name: true } } },
      },
      dashboardNATeamMembers: {
        include: { member: { select: { name: true } } },
      },
    },
    orderBy: { meetingDate: "asc" },
  });

  const rows: WeeklyExportRow[] = meetings.map((m) => {
    // Combined absent count — User-side + ClientMember-side (matches the
    // dashboard math, see weekly stats route).
    const absentMemberCount =
      m.absentMembers.length + m.absentTeamMembers.length;
    const presentMemberCount = Math.max(0, totalMembers - absentMemberCount);
    const presentPercentage =
      totalMembers > 0
        ? `${((presentMemberCount / totalMembers) * 100).toFixed(2)}%`
        : "0.00%";

    const namesUser = (
      list: { user: { firstName: string; lastName: string } }[],
    ) => list.map((x) => `${x.user.firstName} ${x.user.lastName}`.trim());
    const namesClient = (
      list: { member: { name: string } }[],
    ) => list.map((x) => x.member.name.trim());

    const absentNames = [
      ...namesClient(m.absentTeamMembers),
      ...namesUser(m.absentMembers),
    ].join(", ");
    const dashboardNANames = [
      ...namesClient(m.dashboardNATeamMembers),
      ...namesUser(m.dashboardNAMembers),
    ].join(", ");

    return {
      meetingDate: m.meetingDate.toISOString().slice(0, 10),
      callStatus: m.callStatus,
      clientName: client.name,
      absentMembers: absentNames,
      dashboardNAMembers: dashboardNANames,
      actualStartTime: m.actualStartTime ?? "",
      actualEndTime: m.actualEndTime ?? "",
      goodNewsSharing: m.goodNewsSharing,
      segmentTime1: m.segmentTime1 ?? "",
      kpDashboard: m.kpDashboard,
      segmentTime2: m.segmentTime2 ?? "",
      gaps: m.gaps,
      segmentTime3: m.segmentTime3 ?? "",
      www: m.www,
      segmentTime4: m.segmentTime4 ?? "",
      feedback: m.feedback,
      segmentTime5: m.segmentTime5 ?? "",
      collectiveIntelligence: m.collectiveIntelligence,
      segmentTime6: m.segmentTime6 ?? "",
      opspReview: m.opspReview,
      segmentTime7: m.segmentTime7 ?? "",
      notesKPDashboard: stripHtml(m.notesKPDashboard),
      otherNotes: stripHtml(m.otherNotes),
      totalMembers,
      presentMemberCount,
      absentMemberCount,
      presentPercentage,
    };
  });

  const columns: DetailExportColumn<WeeklyExportRow>[] = [
    { label: "Meeting Date",                       value: (r) => r.meetingDate, width: 12 },
    { label: "Call Status",                        value: (r) => r.callStatus, width: 12 },
    { label: "Client Name",                        value: (r) => r.clientName, width: 18 },
    { label: "Absent Members",                     value: (r) => r.absentMembers, width: 24 },
    { label: "Weekly Dashboard NA",                value: (r) => r.dashboardNAMembers, width: 24 },
    { label: "Actual Start Time",                  value: (r) => r.actualStartTime, width: 14 },
    { label: "Actual End Time",                    value: (r) => r.actualEndTime, width: 14 },
    { label: "Good News Sharing",                  value: (r) => r.goodNewsSharing, width: 14 },
    { label: "Good News Sharing Time",             value: (r) => r.segmentTime1, width: 14 },
    { label: "K&P dashboard",                      value: (r) => r.kpDashboard, width: 14 },
    { label: "K&P dashboard Time",                 value: (r) => r.segmentTime2, width: 14 },
    { label: "GAPS",                               value: (r) => r.gaps, width: 10 },
    { label: "GAPS Time",                          value: (r) => r.segmentTime3, width: 12 },
    { label: "WWW",                                value: (r) => r.www, width: 10 },
    { label: "WWW Time",                           value: (r) => r.segmentTime4, width: 12 },
    { label: "Customer/Employee Feedback",         value: (r) => r.feedback, width: 18 },
    { label: "Customer/Employee Feedback Time",    value: (r) => r.segmentTime5, width: 18 },
    { label: "Collective Intelligence",            value: (r) => r.collectiveIntelligence, width: 18 },
    { label: "Collective Intelligence Time",       value: (r) => r.segmentTime6, width: 18 },
    { label: "OPSP Review",                        value: (r) => r.opspReview, width: 14 },
    { label: "OPSP Review Time",                   value: (r) => r.segmentTime7, width: 14 },
    { label: "Notes K&P dashboard",                value: (r) => r.notesKPDashboard, width: 32 },
    { label: "Other Notes",                        value: (r) => r.otherNotes, width: 32 },
    { label: "Total Members",                      value: (r) => r.totalMembers, width: 14 },
    { label: "Planned Deviation In Time",          value: () => "", width: 18 },
    { label: "Present Member Count",               value: (r) => r.presentMemberCount, width: 16 },
    { label: "Absent Member Count",                value: (r) => r.absentMemberCount, width: 16 },
    { label: "Present Percentage (%)",             value: (r) => r.presentPercentage, width: 18 },
  ];

  const buf = await buildDetailExport({
    clientName: client.name,
    plannedStartTime: client.weeklyStartTime,
    plannedEndTime: client.weeklyEndTime,
    columns,
    rows,
  });

  // Filename: `{ClientName}_{YYYY-MM}_to_{YYYY-MM}_Weekly MeetingExport.xlsx`
  const fromMonth = from.slice(0, 7);
  const toMonth = to.slice(0, 7);
  const filename = `${sanitizeFilename(client.name)}_${fromMonth}_to_${toMonth}_Weekly MeetingExport.xlsx`;

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});

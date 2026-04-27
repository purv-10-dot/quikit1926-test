import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import {
  calculateDailyMonthlyStats, calculateWeeklyMonthlyStats,
  computeMemberPunchIn, calculateOverallFinalAverage,
  previousMonths, type MonthlyStatRow,
} from "@/lib/services/clientMeetingsMath";

const withTenantAuth = withTenantAuthForModule("clientMeetings.dashboard");

/**
 * GET /api/client-meetings/dashboard
 *   ?clientId=...&mode=daily|weekly&monthsBack=6
 *   (optional) &punchInUserId=... → returns per-member weekly punch-in rows
 *
 * Returns up to 6 months of monthly aggregates + overall totals.
 */
export const GET = withTenantAuth(async ({ tenantId }, request) => {
  const url = new URL(request.url);
  const clientId = url.searchParams.get("clientId");
  const mode = (url.searchParams.get("mode") ?? "daily") as "daily" | "weekly";
  const monthsBack = parseInt(url.searchParams.get("monthsBack") ?? "6", 10);
  const punchUserId = url.searchParams.get("punchInUserId");

  if (!clientId)
    return NextResponse.json({ success: false, error: "clientId required" }, { status: 400 });

  const client = await db.client.findFirst({
    where: { id: clientId, tenantId, deletedAt: null },
    include: {
      teamMembers: {
        include: { member: { select: { id: true, name: true, email: true, deletedAt: true } } },
      },
    },
  });
  if (!client) return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });

  const months = previousMonths(new Date(), monthsBack);
  const from = new Date(Date.UTC(months[0].year, months[0].month, 1));
  const toEnd = new Date(Date.UTC(months[months.length - 1].year, months[months.length - 1].month + 1, 0, 23, 59, 59, 999));

  let monthlyStats: MonthlyStatRow[] = [];

  if (mode === "daily") {
    const huddles = await db.clientDailyHuddle.findMany({
      where: { tenantId, clientId, deletedAt: null, meetingDate: { gte: from, lte: toEnd } },
      include: { absentMembers: true },
    });
    monthlyStats = calculateDailyMonthlyStats(
      huddles.map(h => ({
        meetingDate: h.meetingDate,
        callStatus: h.callStatus,
        actualStartTime: h.actualStartTime,
        actualEndTime: h.actualEndTime,
        format1Status: h.format1Status,
        format2Status: h.format2Status,
        stuckCallStatus: h.stuckCallStatus,
        punctualityOverride: ("NA" as const),
        totalMembers: 0,
        absentCount: h.absentMembers.length,
      })),
      months,
      client.dailyStartTime, client.dailyEndTime,
    );
  } else {
    const meetings = await db.clientWeeklyMeeting.findMany({
      where: { tenantId, clientId, deletedAt: null, meetingDate: { gte: from, lte: toEnd } },
      include: { absentMembers: true, dashboardNAMembers: true },
    });
    monthlyStats = calculateWeeklyMonthlyStats(
      meetings.map(m => ({
        meetingDate: m.meetingDate,
        callStatus: m.callStatus,
        actualStartTime: m.actualStartTime, actualEndTime: m.actualEndTime,
        goodNewsSharing: m.goodNewsSharing, kpDashboard: m.kpDashboard,
        www: m.www, feedback: m.feedback,
        collectiveIntelligence: m.collectiveIntelligence, gaps: m.gaps,
        opspReview: m.opspReview,
        punctualityOverride: ("NA" as const),
        totalMembers: 0,
        absentCount: m.absentMembers.length,
        memberScores: [] as const,
      })),
      months,
      client.weeklyStartTime, client.weeklyEndTime,
    );
  }

  // Compute column totals ("Total Average" column in the UI).
  const avgCol = (key: keyof MonthlyStatRow) => {
    const nums = monthlyStats.filter(m => m.isUpdate).map(m => m[key] as number);
    return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0;
  };
  const overallStats = {
    TotalavgHeld: avgCol("avgHeld"),
    TotalavgPunctual: avgCol("avgPunctual"),
    TotalavgDurationFollowed: avgCol("avgDurationFollowed"),
    TotalavgFormat: avgCol("avgFormat"),
    TotalavgAttendance: avgCol("avgAttendance"),
    TotalavgStuckCalls: avgCol("avgStuckCalls"),
    TotalavgAuality: avgCol("avgAuality"),
    TotalavgKP: avgCol("avgKP"),
    TotalavgWWW: avgCol("avgWWW"),
    TotalavgEF: avgCol("avgEF"),
    TotalavgCI: avgCol("avgCI"),
    TotalTotal: avgCol("Total"),
  };
  const totalCallsAssessed = monthlyStats.reduce((s, m) => s + m.heldCalls, 0);

  // Member punch-in (weekly mode only).
  let punchIn: ReturnType<typeof computeMemberPunchIn> | null = null;
  let punchInOverallAverage: number | null = null;
  if (mode === "weekly" && punchUserId) {
    const tm = client.teamMembers.find(t => t.member.id === punchUserId);
    if (tm && !tm.member.deletedAt) {
      const meetings = await db.clientWeeklyMeeting.findMany({
        where: { tenantId, clientId, deletedAt: null, meetingDate: { gte: from, lte: toEnd } },
        include: {
          absentMembers: true,
          dashboardNAMembers: true,
          memberScores: { where: { clientMemberId: punchUserId } },
        },
        orderBy: { meetingDate: "asc" },
      });
      punchIn = computeMemberPunchIn(
        meetings.map(m => ({
          id: m.id, meetingDate: m.meetingDate,
          absentUserIds: m.absentMembers.map(a => a.userId),
          dashboardNAUserIds: m.dashboardNAMembers.map(a => a.userId),
          memberScores: m.memberScores.map(s => ({
            userId: s.clientMemberId,
            kpiWeeklyQTD: s.kpiWeeklyQTD,
            kpiCoding: s.kpiCoding,
            priorityNotes: s.priorityNotes,
            priorityStartEndDate: s.priorityStartEndDate,
            priorityColor: s.priorityColor,
          })),
        })),
        { id: punchUserId, name: tm.member.name },
      );
      punchInOverallAverage = calculateOverallFinalAverage([punchIn]);
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      client: { id: client.id, name: client.name },
      mode,
      months: months.map(m => ({ year: m.year, month: m.month, monthName: new Date(Date.UTC(m.year, m.month, 1)).toLocaleString("en-US", { month: "long" }) })),
      monthlyStats,
      overallStats,
      totalCallsAssessed,
      // External Client Member roster — matches Update tab + Absent picker.
      // Field name kept as `userId` for client back-compat; semantically a ClientMember.id.
      roster: client.teamMembers
        .filter(tm => !tm.member.deletedAt)
        .map(tm => ({ userId: tm.member.id, name: tm.member.name })),
      punchIn,
      punchInOverallAverage,
    },
  });
});

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
    include: { memberships: { where: { deletedAt: null }, include: { user: { select: { id: true, firstName: true, lastName: true } } } } },
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
        punctualityOverride: h.punctualityOverride,
        totalMembers: h.totalMembers,
        absentCount: h.absentMembers.length,
      })),
      months,
      client.dailyStartTime, client.dailyEndTime,
    );
  } else {
    const meetings = await db.clientWeeklyMeeting.findMany({
      where: { tenantId, clientId, deletedAt: null, meetingDate: { gte: from, lte: toEnd } },
      include: { absentMembers: true, dashboardNAMembers: true, memberScores: true },
    });
    monthlyStats = calculateWeeklyMonthlyStats(
      meetings.map(m => ({
        meetingDate: m.meetingDate,
        callStatus: m.callStatus,
        actualStartTime: m.actualStartTime, actualEndTime: m.actualEndTime,
        formatCheck1: m.formatCheck1, formatCheck2: m.formatCheck2,
        wwwReviewDone: m.wwwReviewDone, feedbackDone: m.feedbackDone,
        collectiveIntelDone: m.collectiveIntelDone, kpGapsDiscussed: m.kpGapsDiscussed,
        dashboardQuality: m.dashboardQuality,
        punctualityOverride: m.punctualityOverride,
        totalMembers: m.totalMembers,
        absentCount: m.absentMembers.length,
        memberScores: m.memberScores,
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
    const member = client.memberships.find(m => m.userId === punchUserId);
    if (member) {
      const meetings = await db.clientWeeklyMeeting.findMany({
        where: { tenantId, clientId, deletedAt: null, meetingDate: { gte: from, lte: toEnd } },
        include: { absentMembers: true, dashboardNAMembers: true, memberScores: true },
        orderBy: { meetingDate: "asc" },
      });
      punchIn = computeMemberPunchIn(
        meetings.map(m => ({
          id: m.id, meetingDate: m.meetingDate,
          absentUserIds: m.absentMembers.map(a => a.userId),
          dashboardNAUserIds: m.dashboardNAMembers.map(a => a.userId),
          memberScores: m.memberScores,
        })),
        { id: punchUserId, name: `${member.user.firstName} ${member.user.lastName}`.trim() },
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
      roster: client.memberships.map(m => ({
        userId: m.userId, name: `${m.user.firstName} ${m.user.lastName}`.trim(),
      })),
      punchIn,
      punchInOverallAverage,
    },
  });
});

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("analytics.individual");

export const GET = withTenantAuth(async ({ tenantId }, request) => {
    const { page, limit, skip, take } = parsePagination(request);
    const where = { tenantId };

    const [members, total] = await Promise.all([
      db.membership.findMany({
        where,
        include: {
          user: {
            include: {
              kpisOwned: { where: { tenantId }, include: { weeklyValues: true } },
              prioritiesOwned: { where: { tenantId }, include: { weeklyStatuses: true } },
            }
          },
          team: true,
        },
        skip,
        take,
      }),
      db.membership.count({ where }),
    ]);

    // Only load meetings whose attendees include the paginated user set —
    // avoids scanning all tenant meetings just to compute attendance for
    // N users we're returning in this page.
    const paginatedUserIds = members.map(m => m.user.id);
    const meetings = paginatedUserIds.length
      ? await db.meeting.findMany({
          where: { tenantId, attendees: { some: { userId: { in: paginatedUserIds } } } },
          include: { attendees: { where: { userId: { in: paginatedUserIds } } } },
        })
      : [];

    const people = members.map(m => {
      const u = m.user;
      const kpis = u.kpisOwned;
      const priorities = u.prioritiesOwned;

      // KPI score
      const kpiScore = kpis.length > 0
        ? Math.round(kpis.reduce((sum, k) => sum + (k.progressPercent || 0), 0) / kpis.length)
        : null;

      // Priority score
      const completedP = priorities.filter(p => p.overallStatus === "completed").length;
      const priorityScore = priorities.length > 0 ? Math.round((completedP / priorities.length) * 100) : null;

      // Attendance score
      const userMeetingSlots = meetings.flatMap(mt => mt.attendees.filter(a => a.userId === u.id));
      const attendedSlots = userMeetingSlots.filter(a => a.attended).length;
      const attendanceScore = userMeetingSlots.length > 0 ? Math.round((attendedSlots / userMeetingSlots.length) * 100) : null;

      // Overall
      const weights = [0.5, 0.3, 0.2];
      const validWeights = [kpiScore, priorityScore, attendanceScore].map((s, i) => s !== null ? weights[i] : 0);
      const totalWeight = validWeights.reduce((a, b) => a + b, 0);
      let overallScore: number | null = null;
      if (totalWeight > 0) {
        overallScore = Math.round(
          ([kpiScore, priorityScore, attendanceScore] as (number | null)[]).reduce<number>((sum, s, i) =>
            s !== null ? sum + s * validWeights[i] : sum, 0) / totalWeight
        );
      }

      return {
        userId: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        avatar: u.avatar,
        role: m.role,
        teamName: (m.team as any)?.name || null,
        kpiCount: kpis.length,
        priorityCount: priorities.length,
        kpiScore,
        priorityScore,
        attendanceScore,
        overallScore,
        kpiOnTrack: kpis.filter(k => k.healthStatus === "on-track" || k.healthStatus === "complete").length,
        kpiCritical: kpis.filter(k => k.healthStatus === "critical").length,
        completedPriorities: completedP,
      };
    });

    return NextResponse.json(paginatedResponse(people, total, page, limit));
});

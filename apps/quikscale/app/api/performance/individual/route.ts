import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { quikScaleMemberWhere } from "@/lib/api/permissions";
const withOrgAuth = withOrgAuthForModule("analytics.individual");

export const GET = withOrgAuth(async ({ orgId }, request) => {
    const { page, limit, skip, take } = parsePagination(request);
    const search = (request.nextUrl.searchParams.get("search") ?? "").trim();

    // SCOPE: only QuikScale members (those with an `app_quikscale.UserAppRole`
    // for this org + app). Org members who only have access to other QuikIT
    // apps are excluded. Fail safe to an empty list when the app isn't
    // registered yet — see /api/org/users for the same pattern.
    const memberWhere = await quikScaleMemberWhere(orgId);
    if (!memberWhere) {
      return NextResponse.json(paginatedResponse([], 0, page, limit));
    }

    const where = {
      ...memberWhere,
      ...(search
        ? {
            user: {
              ...memberWhere.user,
              OR: [
                { firstName: { contains: search, mode: "insensitive" as const } },
                { lastName: { contains: search, mode: "insensitive" as const } },
                { email: { contains: search, mode: "insensitive" as const } },
              ],
            },
          }
        : {}),
    };

    // `overallScore` is computed in JS (not a DB column), so we can't ORDER BY
    // it in Prisma. Fetch all matching members, compute + sort, then slice the
    // requested page server-side. `search` already narrows the set in the DB.
    const members = await db.orgMember.findMany({
      where,
      include: {
        user: {
          include: {
            kpisOwned: { where: { orgId }, include: { weeklyValues: true } },
            prioritiesOwned: { where: { orgId }, include: { weeklyStatuses: true } },
          }
        },
        team: true,
      },
    });
    const total = members.length;

    // Only load meetings whose attendees include the paginated user set —
    // avoids scanning all tenant meetings just to compute attendance for
    // N users we're returning in this page.
    // Legacy team-meeting attendance removed in Client Meetings rewrite.
    const meetings: Array<{ attendees: Array<{ attended: boolean; userId: string }> }> = [];

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

    // Sort by overall score (desc) then slice the requested page.
    people.sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0));
    const pageSlice = people.slice(skip, skip + take);

    return NextResponse.json(paginatedResponse(pageSlice, total, page, limit));
});

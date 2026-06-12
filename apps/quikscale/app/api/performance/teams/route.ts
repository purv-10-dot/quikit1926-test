import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { quikScaleMemberWhere } from "@/lib/api/permissions";
const withOrgAuth = withOrgAuthForModule("analytics.teams");

export const GET = withOrgAuth(async ({ orgId }, request) => {
    const { page, limit, skip, take } = parsePagination(request);
    const search = (request.nextUrl.searchParams.get("search") ?? "").trim();

    // Scope team-member aggregation to QuikScale members only — see
    // /api/org/users for the same rule. Fail safe to empty when the app
    // isn't registered yet.
    const memberWhere = await quikScaleMemberWhere(orgId);
    if (!memberWhere) {
      return NextResponse.json(paginatedResponse([], 0, page, limit));
    }

    const teams = await db.qsTeam.findMany({
      where: {
        orgId,
        ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
      },
      include: {
        members: {
          where: { user: memberWhere.user },
          include: {
            user: {
              include: {
                kpisOwned: { where: { orgId } },
                prioritiesOwned: { where: { orgId } },
              }
            }
          }
        }
      }
    });

    // Legacy team-meeting attendance removed in Client Meetings rewrite.
    const meetings: Array<{ attendees: Array<{ attended: boolean; userId: string }> }> = [];

    const teamData = teams.map(t => {
      const memberIds = t.members.map(m => m.userId);
      const allKpis = t.members.flatMap(m => m.user.kpisOwned);
      const allPriorities = t.members.flatMap(m => m.user.prioritiesOwned);
      const teamMeetingAttendees = meetings.flatMap(mt => mt.attendees.filter(a => memberIds.includes(a.userId)));
      const attended = teamMeetingAttendees.filter(a => a.attended).length;

      const kpiScore = allKpis.length > 0
        ? Math.round(allKpis.reduce((s, k) => s + (k.progressPercent || 0), 0) / allKpis.length)
        : null;
      const completedP = allPriorities.filter(p => p.overallStatus === "completed").length;
      const priorityScore = allPriorities.length > 0 ? Math.round((completedP / allPriorities.length) * 100) : null;
      const attendanceScore = teamMeetingAttendees.length > 0 ? Math.round((attended / teamMeetingAttendees.length) * 100) : null;

      const scores = [kpiScore, priorityScore, attendanceScore].filter(s => s !== null) as number[];
      const overallScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

      return {
        teamId: t.id,
        teamName: t.name,
        memberCount: t.members.length,
        kpiCount: allKpis.length,
        priorityCount: allPriorities.length,
        kpiScore,
        priorityScore,
        attendanceScore,
        overallScore,
        kpiOnTrack: allKpis.filter(k => k.healthStatus === "on-track" || k.healthStatus === "complete").length,
        kpiCritical: allKpis.filter(k => k.healthStatus === "critical").length,
        completedPriorities: completedP,
      };
    });

    teamData.sort((a, b) => (b.overallScore || 0) - (a.overallScore || 0));

    // `overallScore` is computed in JS, so sort first then slice the page.
    const total = teamData.length;
    const pageSlice = teamData.slice(skip, skip + take);

    return NextResponse.json(paginatedResponse(pageSlice, total, page, limit));
  });

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("analytics.teams");

export const GET = withTenantAuth(async ({ tenantId }) => {
    const teams = await db.team.findMany({
      where: { tenantId },
      include: {
        members: {
          include: {
            user: {
              include: {
                kpisOwned: { where: { tenantId } },
                prioritiesOwned: { where: { tenantId } },
              }
            }
          }
        }
      }
    });

    const meetings = await db.meeting.findMany({ where: { tenantId }, include: { attendees: true } });

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

    return NextResponse.json({ success: true, data: teamData });
  });

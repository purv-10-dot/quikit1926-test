import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("analytics.scorecard");

export const GET = withTenantAuth(async ({ orgId }) => {
    const [kpis, priorities, wwwItems, teams, members] = await Promise.all([
      db.kPI.findMany({ where: { orgId }, include: { weeklyValues: true } }),
      db.priority.findMany({ where: { orgId }, include: { weeklyStatuses: true } }),
      db.wWWItem.findMany({ where: { orgId } }),
      db.team.findMany({ where: { orgId } }),
      db.membership.findMany({ where: { orgId }, include: { user: true } }),
    ]);
    // Legacy team-meeting attendance was part of this scorecard. The new
    // Client Meetings module tracks meeting-level stats per-client, not
    // per-member, so this block reports 0/0 until we decide how (or whether)
    // to surface client-meeting attendance on the individual scorecard.
    const meetings: Array<{ attendees: Array<{ attended: boolean }> }> = [];

    // KPI health
    const kpiOnTrack = kpis.filter(k => k.healthStatus === "on-track" || k.healthStatus === "complete").length;
    const kpiCritical = kpis.filter(k => k.healthStatus === "critical").length;
    const kpiAtRisk = kpis.filter(k => k.healthStatus === "at-risk").length;
    const kpiAttainment = kpis.length > 0
      ? Math.round(kpis.reduce((sum, k) => sum + (k.progressPercent || 0), 0) / kpis.length)
      : 0;

    // Priority completion
    const completedPriorities = priorities.filter(p => p.overallStatus === "completed").length;
    const priorityRate = priorities.length > 0 ? Math.round((completedPriorities / priorities.length) * 100) : 0;

    // Meeting attendance
    const totalAttendees = meetings.reduce((sum, m) => sum + m.attendees.length, 0);
    const attendedCount = meetings.reduce((sum, m) => sum + m.attendees.filter(a => a.attended).length, 0);
    const attendanceRate = totalAttendees > 0 ? Math.round((attendedCount / totalAttendees) * 100) : 0;

    // WWW open items
    const openWWW = wwwItems.filter(w => w.status === "open" || w.status === "in-progress" || w.status === "not-started").length;
    const overdueWWW = wwwItems.filter(w => {
      const dueDate = w.when;
      if (!dueDate) return false;
      return new Date(dueDate) < new Date() && w.status !== "done" && w.status !== "closed" && w.status !== "completed";
    }).length;

    // Overall org score
    const orgScore = Math.round(kpiAttainment * 0.5 + priorityRate * 0.3 + attendanceRate * 0.2);

    return NextResponse.json({
      success: true,
      data: {
        orgScore,
        kpi: { total: kpis.length, onTrack: kpiOnTrack, atRisk: kpiAtRisk, critical: kpiCritical, attainment: kpiAttainment },
        priority: { total: priorities.length, completed: completedPriorities, rate: priorityRate },
        meetings: { total: meetings.length, attendanceRate },
        www: { total: wwwItems.length, open: openWWW, overdue: overdueWWW },
        teams: teams.length,
        members: members.length,
      }
    });
  });

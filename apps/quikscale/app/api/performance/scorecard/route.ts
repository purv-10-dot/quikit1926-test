import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { quikScaleMemberWhere } from "@/lib/api/permissions";
import { isClosed, isOverdue } from "@/lib/services/wwwLifecycle";
const withOrgAuth = withOrgAuthForModule("analytics.scorecard");

export const GET = withOrgAuth(async ({ orgId }) => {
    // Member count is scoped to QuikScale members only (see /api/org/users).
    const memberWhere = await quikScaleMemberWhere(orgId);
    const [kpis, priorities, wwwItems, teams, memberCount] = await Promise.all([
      db.kPI.findMany({ where: { orgId }, include: { weeklyValues: true } }),
      db.priority.findMany({ where: { orgId }, include: { weeklyStatuses: true } }),
      db.wWWItem.findMany({ where: { orgId } }),
      db.qsTeam.findMany({ where: { orgId } }),
      memberWhere ? db.orgMember.count({ where: memberWhere }) : Promise.resolve(0),
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

    // WWW open + overdue, via the shared lifecycle rules.
    //
    // Both counts were previously computed inline here, and both were wrong:
    //
    //   · `openWWW` matched "open" (a value in no enum in this repo),
    //     "in-progress" and "not-started" (legacy spellings) — and MISSED the
    //     three canonical open states, so it undercounted badly.
    //   · `overdueWWW` excluded "done" and "closed", neither of which exists,
    //     so the exclusion never matched; and it ignored `dueDateTBD`, making
    //     every to-be-decided item overdue from the day it was created.
    //
    // `lib/services/wwwLifecycle.ts` is now the only definition, shared with
    // the WWW list filter and aligned with QuikFlow's overdue notification —
    // so a user cannot see three different overdue counts in three places.
    const openWWW = wwwItems.filter((w) => !isClosed(w.status)).length;
    const overdueWWW = wwwItems.filter((w) => isOverdue(w)).length;

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
        members: memberCount,
      }
    });
  });

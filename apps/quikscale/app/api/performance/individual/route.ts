import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const user = await db.user.findUnique({ where: { id: session.user.id }, include: { memberships: true } });
    const tenantId = user?.memberships[0]?.tenantId;
    if (!tenantId) return NextResponse.json({ success: false, error: "No tenant" }, { status: 400 });

    const members = await db.membership.findMany({
      where: { tenantId },
      include: {
        user: {
          include: {
            kpisOwned: { where: { tenantId }, include: { weeklyValues: true } },
            prioritiesOwned: { where: { tenantId }, include: { weeklyStatuses: true } },
          }
        },
        team: true,
      }
    });

    const meetings = await db.meeting.findMany({
      where: { tenantId },
      include: { attendees: true }
    });

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

    return NextResponse.json({ success: true, data: people });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

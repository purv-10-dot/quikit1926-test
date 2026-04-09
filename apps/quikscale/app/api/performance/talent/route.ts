import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      include: { memberships: true },
    });
    const tenantId = user?.memberships[0]?.tenantId;
    if (!tenantId)
      return NextResponse.json({ success: false, error: "No tenant" }, { status: 400 });

    // Fetch all members with performance data
    const members = await db.membership.findMany({
      where: { tenantId },
      include: {
        user: {
          include: {
            kpisOwned: { where: { tenantId } },
            prioritiesOwned: { where: { tenantId } },
            talentAssessed: {
              where: { tenantId },
              orderBy: { createdAt: "desc" },
              take: 1,
              include: { assessor: { select: { id: true, firstName: true, lastName: true } } },
            },
          },
        },
        team: true,
      },
    });

    const meetings = await db.meeting.findMany({
      where: { tenantId },
      include: { attendees: true },
    });

    const people = members.map((m) => {
      const u = m.user;
      const kpis = u.kpisOwned;
      const priorities = u.prioritiesOwned;
      const assessment = u.talentAssessed[0] || null;

      // Performance score (X axis)
      const kpiScore =
        kpis.length > 0
          ? kpis.reduce((s, k) => s + (k.progressPercent || 0), 0) / kpis.length
          : null;
      const completedP = priorities.filter((p) => p.overallStatus === "completed").length;
      const priorityScore =
        priorities.length > 0 ? (completedP / priorities.length) * 100 : null;
      const userSlots = meetings.flatMap((mt) =>
        mt.attendees.filter((a) => a.userId === u.id)
      );
      const attendedSlots = userSlots.filter((a) => a.attended).length;
      const attendanceScore =
        userSlots.length > 0 ? (attendedSlots / userSlots.length) * 100 : null;

      const scores = [kpiScore, priorityScore, attendanceScore].filter(
        (s) => s !== null
      ) as number[];
      const weights = [0.5, 0.3, 0.2];
      let performanceScore: number | null = null;
      if (scores.length > 0) {
        const validW = [kpiScore, priorityScore, attendanceScore].map((s, i) =>
          s !== null ? weights[i] : 0
        );
        const totalW = validW.reduce((a, b) => a + b, 0);
        if (totalW > 0) {
          const weighted = [kpiScore, priorityScore, attendanceScore].reduce<number>(
            (sum, s, i) => (s !== null ? sum + (s as number) * (validW[i] ?? 0) : sum),
            0
          );
          performanceScore = Math.round(weighted / totalW);
        }
      }

      // Map performance score → low/medium/high
      const perfBand =
        performanceScore === null
          ? "medium"
          : performanceScore >= 70
          ? "high"
          : performanceScore >= 40
          ? "medium"
          : "low";

      return {
        userId: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        avatar: u.avatar,
        role: m.role,
        teamName: m.team?.name || null,
        performanceScore,
        perfBand,
        kpiCount: kpis.length,
        priorityCount: priorities.length,
        // Talent assessment fields
        potential: assessment?.potential || null,
        flightRisk: assessment?.flightRisk || null,
        successionReady: assessment?.successionReady || null,
        skills: assessment?.skills || [],
        developmentNotes: assessment?.developmentNotes || null,
        assessmentId: assessment?.id || null,
        assessorName: assessment
          ? `${assessment.assessor.firstName} ${assessment.assessor.lastName}`
          : null,
        lastAssessed: assessment?.updatedAt || null,
        quarter: assessment?.quarter || null,
        year: assessment?.year || null,
      };
    });

    return NextResponse.json({ success: true, data: people });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      include: { memberships: true },
    });
    const tenantId = user?.memberships[0]?.tenantId;
    if (!tenantId)
      return NextResponse.json({ success: false, error: "No tenant" }, { status: 400 });

    const body = await req.json();
    const {
      userId, potential, flightRisk, successionReady,
      skills, developmentNotes, quarter, year,
    } = body;

    const assessment = await db.talentAssessment.upsert({
      where: {
        tenantId_userId_quarter_year: {
          tenantId,
          userId,
          quarter: quarter || "Q1",
          year: Number(year) || new Date().getFullYear(),
        },
      },
      create: {
        tenantId,
        userId,
        assessorId: session.user.id,
        potential: potential || "medium",
        flightRisk: flightRisk || "low",
        successionReady: successionReady || "not-ready",
        skills: skills || [],
        developmentNotes: developmentNotes || null,
        quarter: quarter || "Q1",
        year: Number(year) || new Date().getFullYear(),
      },
      update: {
        assessorId: session.user.id,
        potential: potential || "medium",
        flightRisk: flightRisk || "low",
        successionReady: successionReady || "not-ready",
        skills: skills || [],
        developmentNotes: developmentNotes || null,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        assessor: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return NextResponse.json({ success: true, data: assessment });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

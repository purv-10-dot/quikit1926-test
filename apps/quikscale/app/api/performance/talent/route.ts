import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
const withOrgAuth = withOrgAuthForModule("people.talent");
import { talentAssessmentSchema } from "@/lib/schemas/talentSchema";

export const GET = withOrgAuth(async ({ orgId }, request) => {
    const { page, limit, skip, take } = parsePagination(request);
    const where = { orgId };

    // Fetch paginated members with performance data
    const [members, total] = await Promise.all([
      db.orgMember.findMany({
        where,
        include: {
          user: {
            include: {
              kpisOwned: { where: { orgId } },
              prioritiesOwned: { where: { orgId } },
              talentAssessed: {
                where: { orgId },
                orderBy: { createdAt: "desc" },
                take: 1,
                include: { assessor: { select: { id: true, firstName: true, lastName: true } } },
              },
            },
          },
          team: true,
        },
        skip,
        take,
      }),
      db.orgMember.count({ where }),
    ]);

    // Legacy team-meeting attendance removed in Client Meetings rewrite.
    const meetings: Array<{ attendees: Array<{ attended: boolean; userId: string }> }> = [];

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

    return NextResponse.json(paginatedResponse(people, total, page, limit));
});

export const POST = withOrgAuth(async ({ orgId, userId: actorId }, req) => {
    const body = await req.json();
    const parsed = talentAssessmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const {
      userId, potential, flightRisk, successionReady,
      skills, developmentNotes, quarter, year,
    } = parsed.data;

    const assessment = await db.talentAssessment.upsert({
      where: {
        orgId_userId_quarter_year: {
          orgId,
          userId,
          quarter,
          year,
        },
      },
      create: {
        orgId,
        userId,
        assessorId: actorId,
        potential,
        flightRisk,
        successionReady,
        skills,
        developmentNotes: developmentNotes ?? null,
        quarter,
        year,
      },
      update: {
        assessorId: actorId,
        potential,
        flightRisk,
        successionReady,
        skills,
        developmentNotes: developmentNotes ?? null,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        assessor: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return NextResponse.json({ success: true, data: assessment });
});

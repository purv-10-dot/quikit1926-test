import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
const withOrgAuth = withOrgAuthForModule("people.talent");
import {
  talentAssessmentSchema, classifyTalent, computePerformanceScore,
  computePotentialScore, quadrantFromScores, DEFAULT_BENCHMARK,
} from "@/lib/schemas/talentSchema";

// Auto-signals window — last 90 days of meeting attendance.
const ATTENDANCE_WINDOW_DAYS = 90;

export const GET = withOrgAuth(async ({ orgId }, request) => {
    const { page, limit, skip, take } = parsePagination(request);
    const where = { orgId };
    const since = new Date(Date.now() - ATTENDANCE_WINDOW_DAYS * 86_400_000);

    // Org benchmark cut-lines for the A/B/C/D quadrant (defaults 50/50).
    const benchmarkRow = await db.talentBenchmark.findUnique({ where: { orgId } });
    const perfCut = benchmarkRow?.perfCut ?? DEFAULT_BENCHMARK.perfCut;
    const potentialCut = benchmarkRow?.potentialCut ?? DEFAULT_BENCHMARK.potentialCut;

    // Fetch paginated members + everything we need to compute auto signals in one round-trip.
    const [members, total, totalDailyHuddles] = await Promise.all([
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
              reviewsReceived: {
                where: { orgId },
                orderBy: [{ year: "desc" }, { quarter: "desc" }],
                take: 1,
                select: { overallScore: true, quarter: true, year: true },
              },
              dailyHuddleAbsences: {
                where: { huddle: { orgId, meetingDate: { gte: since } } },
                select: { huddleId: true },
              },
              accountabilityFunctions: {
                where: { orgId },
                select: { id: true, name: true, teamId: true },
              },
            },
          },
          team: true,
        },
        skip,
        take,
      }),
      db.orgMember.count({ where }),
      db.clientDailyHuddle.count({ where: { orgId, meetingDate: { gte: since } } }),
    ]);

    const people = members.map((m) => {
      const u = m.user;
      const kpis = u.kpisOwned;
      const priorities = u.prioritiesOwned;
      const assessment = u.talentAssessed[0] || null;

      // ── KPI hit rate (0–100) ──
      const kpiScore =
        kpis.length > 0
          ? kpis.reduce((s, k) => s + (k.progressPercent || 0), 0) / kpis.length
          : null;

      // ── Priority completion (0–100) ──
      const completedP = priorities.filter((p) => p.overallStatus === "completed").length;
      const priorityScore =
        priorities.length > 0 ? (completedP / priorities.length) * 100 : null;

      // ── Daily huddle attendance (0–100) — last 90 days ──
      const huddleAbsences = u.dailyHuddleAbsences.length;
      const huddleAttendancePct = totalDailyHuddles > 0
        ? Math.max(0, Math.round(((totalDailyHuddles - huddleAbsences) / totalDailyHuddles) * 100))
        : null;

      // ── Composite performance score (KPI 50% / Priority 30% / Huddles 20%) ──
      const performanceScore = computePerformanceScore({
        kpiScore: kpiScore !== null ? Math.round(kpiScore) : null,
        priorityScore: priorityScore !== null ? Math.round(priorityScore) : null,
        huddleAttendancePct,
      });
      const perfBand =
        performanceScore === null ? "medium"
        : performanceScore >= 70 ? "high"
        : performanceScore >= 40 ? "medium"
        : "low";

      // ── Scaling-Up auto signals ──
      const seatsOwned = u.accountabilityFunctions.length;
      const lastReview = u.reviewsReceived[0] ?? null;
      const tenureDays = m.createdAt
        ? Math.floor((Date.now() - new Date(m.createdAt).getTime()) / 86_400_000)
        : null;

      // ── A/B/C derived headline (live, may differ from stored snapshot) ──
      const classification = classifyTalent({
        rehireDecision: assessment?.rehireDecision,
        coreValuesScore: assessment?.coreValuesScore ?? null,
        performanceScore,
      });

      // Quadrant-view inputs — derived from existing fields, no new schema.
      const potentialScore = computePotentialScore({
        coreValuesScore: assessment?.coreValuesScore ?? null,
        rehireDecision: assessment?.rehireDecision,
      });
      const quadrant = quadrantFromScores({ performanceScore, potentialScore, perfCut, potentialCut });

      return {
        userId: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        avatar: u.avatar,
        role: m.role,
        teamName: m.team?.name || null,

        // Auto-derived (Scaling-Up Block A)
        performanceScore,
        perfBand,
        kpiCount: kpis.length,
        kpiScore: kpiScore !== null ? Math.round(kpiScore) : null,
        priorityCount: priorities.length,
        priorityScore: priorityScore !== null ? Math.round(priorityScore) : null,
        huddleAttendancePct,
        seatsOwned,
        seatNames: u.accountabilityFunctions.map((f) => f.name),
        lastReviewScore: lastReview?.overallScore ?? null,
        lastReviewPeriod: lastReview ? `${lastReview.quarter} ${lastReview.year}` : null,
        tenureDays,

        // Manager judgment (Scaling-Up Block B)
        rehireDecision: assessment?.rehireDecision ?? "unrated",
        rightSeat:      assessment?.rightSeat ?? "unrated",
        coreValuesScore: assessment?.coreValuesScore ?? null,
        capacity:       assessment?.capacity ?? null,
        doMore:         assessment?.doMore ?? null,
        doLess:         assessment?.doLess ?? null,

        // Headline label
        classification,

        // Quadrant view (2×2 dot plot — A/B/C/D)
        potentialScore,
        quadrant,

        // Legacy 9-box (preserved)
        potential: assessment?.potential || null,
        flightRisk: assessment?.flightRisk || null,
        successionReady: assessment?.successionReady || null,
        skills: assessment?.skills || [],
        developmentNotes: assessment?.developmentNotes || null,

        // Meta
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
    const d = parsed.data;

    // Snapshot auto-signals at save time so historical assessments retain the context they were made in.
    const [member, kpiAgg, priorityAgg, recentHuddles, huddleAbsences, lastReview] =
      await Promise.all([
        db.orgMember.findFirst({
          where: { orgId, userId: d.userId },
          include: { team: { select: { name: true } } },
        }),
        db.kPI.aggregate({
          where: { orgId, owner: d.userId },
          _avg: { progressPercent: true },
          _count: true,
        }),
        db.priority.findMany({
          where: { orgId, owner: d.userId },
          select: { overallStatus: true },
        }),
        db.clientDailyHuddle.count({
          where: { orgId, meetingDate: { gte: new Date(Date.now() - ATTENDANCE_WINDOW_DAYS * 86_400_000) } },
        }),
        db.clientDailyHuddleAbsence.count({
          where: { userId: d.userId, huddle: { orgId } },
        }),
        db.performanceReview.findFirst({
          where: { orgId, revieweeId: d.userId },
          orderBy: [{ year: "desc" }, { quarter: "desc" }],
          select: { overallScore: true, quarter: true, year: true },
        }),
      ]);

    const kpiScore = kpiAgg._avg.progressPercent ?? null;
    const completedP = priorityAgg.filter((p) => p.overallStatus === "completed").length;
    const priorityScore = priorityAgg.length > 0 ? (completedP / priorityAgg.length) * 100 : null;
    const huddlePct = recentHuddles > 0
      ? Math.max(0, Math.round(((recentHuddles - huddleAbsences) / recentHuddles) * 100))
      : null;

    const performanceScore = computePerformanceScore({
      kpiScore: kpiScore !== null ? Math.round(kpiScore) : null,
      priorityScore: priorityScore !== null ? Math.round(priorityScore) : null,
      huddleAttendancePct: huddlePct,
    });

    const autoSignals = {
      kpiScore:           kpiScore !== null ? Math.round(kpiScore) : null,
      priorityScore:      priorityScore !== null ? Math.round(priorityScore) : null,
      huddleAttendancePct: huddlePct,
      performanceScore,
      lastReviewScore:    lastReview?.overallScore ?? null,
      lastReviewPeriod:   lastReview ? `${lastReview.quarter} ${lastReview.year}` : null,
      tenureDays:         member?.createdAt
        ? Math.floor((Date.now() - new Date(member.createdAt).getTime()) / 86_400_000)
        : null,
      capturedAt:         new Date().toISOString(),
    };

    const classification = classifyTalent({
      rehireDecision: d.rehireDecision,
      coreValuesScore: d.coreValuesScore ?? null,
      performanceScore,
    });

    const assessment = await db.talentAssessment.upsert({
      where: {
        orgId_userId_quarter_year: {
          orgId,
          userId: d.userId,
          quarter: d.quarter,
          year: d.year,
        },
      },
      create: {
        orgId,
        userId: d.userId,
        assessorId: actorId,
        potential: d.potential,
        flightRisk: d.flightRisk,
        successionReady: d.successionReady,
        skills: d.skills,
        developmentNotes: d.developmentNotes ?? null,
        rehireDecision: d.rehireDecision,
        rightSeat: d.rightSeat,
        coreValuesScore: d.coreValuesScore ?? null,
        capacity: d.capacity ?? null,
        doMore: d.doMore ?? null,
        doLess: d.doLess ?? null,
        classification,
        autoSignals,
        quarter: d.quarter,
        year: d.year,
      },
      update: {
        assessorId: actorId,
        potential: d.potential,
        flightRisk: d.flightRisk,
        successionReady: d.successionReady,
        skills: d.skills,
        developmentNotes: d.developmentNotes ?? null,
        rehireDecision: d.rehireDecision,
        rightSeat: d.rightSeat,
        coreValuesScore: d.coreValuesScore ?? null,
        capacity: d.capacity ?? null,
        doMore: d.doMore ?? null,
        doLess: d.doLess ?? null,
        classification,
        autoSignals,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        assessor: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return NextResponse.json({ success: true, data: assessment });
});

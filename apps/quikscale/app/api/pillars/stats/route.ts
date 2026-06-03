import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

/**
 * GET /api/pillars/stats
 * Aggregates module counts across all 4 Scaling Up pillars for the hub page.
 */
export const GET = withOrgAuth(
  async ({ orgId }) => {
    const [
      goalsTotal,
      goalsOnTrack,
      goalsAtRisk,
      performanceReviews,
      oneOnOnes,
      feedbackEntries,
      talentAssessments,
      kpis,
      priorities,
      wwwItems,
      clientHuddles,
      opsp,
      habitsTotal,
      faceTotal,
      faceAssigned,
      paceTotal,
      swtTotal,
      surveysTotal,
      surveysActive,
    ] = await Promise.all([
      db.goal.count({ where: { orgId } }),
      db.goal.count({ where: { orgId, status: "on-track" } }),
      db.goal.count({ where: { orgId, status: "at-risk" } }),
      db.performanceReview.count({ where: { orgId } }),
      db.oneOnOne.count({ where: { orgId } }),
      db.feedbackEntry.count({ where: { orgId } }),
      db.talentAssessment.count({ where: { orgId } }),
      db.kPI.findMany({
        where: { orgId },
        select: { healthStatus: true },
      }),
      db.priority.count({ where: { orgId } }),
      db.wWWItem.count({ where: { orgId } }),
      db.clientDailyHuddle.count({ where: { orgId } }),
      db.oPSPData.findFirst({
        where: { orgId },
        select: { status: true },
        orderBy: { updatedAt: "desc" },
      }),
      db.habitAssessment.count({ where: { orgId } }),
      db.accountabilityFunction.count({ where: { orgId, chartType: "face" } }),
      db.accountabilityFunction.count({ where: { orgId, chartType: "face", assignedToUserId: { not: null } } }),
      db.accountabilityFunction.count({ where: { orgId, chartType: "pace" } }),
      db.sWTEntry.count({ where: { orgId } }),
      db.survey.count({ where: { orgId } }),
      db.survey.count({ where: { orgId, status: "active" } }),
    ]);

    const kpiOnTrack = kpis.filter((k) => k.healthStatus === "on-track").length;
    const kpiAtRisk = kpis.filter((k) => k.healthStatus === "at-risk").length;
    const kpiOffTrack = kpis.filter((k) => k.healthStatus === "off-track").length;

    return NextResponse.json({
      success: true,
      data: {
        people: {
          goals: { total: goalsTotal, onTrack: goalsOnTrack, atRisk: goalsAtRisk },
          performanceReviews: { total: performanceReviews },
          oneOnOnes: { total: oneOnOnes },
          feedback: { total: feedbackEntries },
          talent: { total: talentAssessments },
          face: { total: faceTotal, assigned: faceAssigned },
          pace: { total: paceTotal },
          surveys: { total: surveysTotal, active: surveysActive },
        },
        strategy: {
          opsp: { status: opsp?.status ?? null },
          habits: { total: habitsTotal },
          swt: { total: swtTotal },
        },
        execution: {
          kpi: { total: kpis.length, onTrack: kpiOnTrack, atRisk: kpiAtRisk, offTrack: kpiOffTrack },
          priorities: { total: priorities },
          www: { total: wwwItems },
          meetings: { total: clientHuddles },
        },
      },
    });
  },
  { fallbackErrorMessage: "Failed to fetch pillar stats" },
);

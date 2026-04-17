import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("people.cycle");

/**
 * GET /api/performance/cycle
 *
 * Cycle Hub data endpoint — computes the current phase of the quarterly
 * performance cycle from existing data (QuarterSetting + PerformanceReview
 * + Goals). Read-only, zero writes.
 *
 * The phase is inferred from:
 *   1. Where we are in the current quarter (early / mid / late / closing week)
 *   2. The review status of the current user (draft → self → manager → etc.)
 *   3. Whether the user has active goals for the current quarter
 */

type Phase =
  | "quarter-kickoff"       // week 1-2: set goals
  | "execution"             // week 3-11: track KPIs, run meetings
  | "self-assessment"       // week 12: fill self-review
  | "manager-review"        // week 13: manager writes review
  | "calibration"           // end-of-quarter admin
  | "closed";               // quarter over, waiting for next

function computePhaseFromDate(
  scheduledStart: Date,
  scheduledEnd: Date,
  today: Date,
): Phase {
  const totalDays =
    Math.round((scheduledEnd.getTime() - scheduledStart.getTime()) / 86_400_000) + 1;
  const daysIn =
    Math.round((today.getTime() - scheduledStart.getTime()) / 86_400_000) + 1;

  if (daysIn < 1) return "quarter-kickoff";
  if (daysIn > totalDays) return "closed";

  const weekInQuarter = Math.ceil(daysIn / 7);
  if (weekInQuarter <= 2) return "quarter-kickoff";
  if (weekInQuarter <= 11) return "execution";
  if (weekInQuarter === 12) return "self-assessment";
  return "manager-review";
}

export const GET = withTenantAuth(
  async ({ tenantId, userId }) => {
    const today = new Date();

    // 1. Find the current quarter (the one containing today)
    const currentQuarter = await db.quarterSetting.findFirst({
      where: {
        tenantId,
        startDate: { lte: today },
        endDate: { gte: today },
      },
      select: {
        id: true,
        fiscalYear: true,
        quarter: true,
        startDate: true,
        endDate: true,
      },
    });

    if (!currentQuarter) {
      return NextResponse.json({
        success: true,
        data: {
          phase: "closed" as Phase,
          quarter: null,
          year: null,
          startDate: null,
          endDate: null,
          weekInQuarter: null,
          weeksRemaining: null,
          userReview: null,
          metrics: null,
          message: "No active quarter. Initialize Quarter Settings to start a cycle.",
        },
      });
    }

    const phaseFromDate = computePhaseFromDate(
      currentQuarter.startDate,
      currentQuarter.endDate,
      today,
    );

    // 2. Find this user's review for the current quarter (if any)
    const userReview = await db.performanceReview.findFirst({
      where: {
        tenantId,
        revieweeId: userId,
        quarter: currentQuarter.quarter,
        year: currentQuarter.fiscalYear,
      },
      select: {
        id: true,
        status: true,
        rating: true,
        overallScore: true,
        updatedAt: true,
      },
    });

    // 3. Get the user's goals for this quarter (active + overall count)
    const [activeGoalsCount, totalGoalsCount] = await Promise.all([
      db.goal.count({
        where: {
          tenantId,
          ownerId: userId,
          year: currentQuarter.fiscalYear,
          quarter: currentQuarter.quarter,
          status: { in: ["active", "on-track", "at-risk"] },
        },
      }),
      db.goal.count({
        where: {
          tenantId,
          ownerId: userId,
          year: currentQuarter.fiscalYear,
          quarter: currentQuarter.quarter,
        },
      }),
    ]);

    // 4. Tenant-wide cycle metrics (org context for the header cards)
    const [orgReviewsPending, orgReviewsComplete, orgGoalsActive] =
      await Promise.all([
        db.performanceReview.count({
          where: {
            tenantId,
            quarter: currentQuarter.quarter,
            year: currentQuarter.fiscalYear,
            status: { in: ["draft", "self-assessment", "manager-review"] },
          },
        }),
        db.performanceReview.count({
          where: {
            tenantId,
            quarter: currentQuarter.quarter,
            year: currentQuarter.fiscalYear,
            status: { in: ["approved", "shared", "signed", "finalized"] },
          },
        }),
        db.goal.count({
          where: {
            tenantId,
            year: currentQuarter.fiscalYear,
            quarter: currentQuarter.quarter,
            status: { in: ["active", "on-track", "at-risk"] },
          },
        }),
      ]);

    const totalDays =
      Math.round(
        (currentQuarter.endDate.getTime() - currentQuarter.startDate.getTime()) /
          86_400_000,
      ) + 1;
    const daysIn =
      Math.round(
        (today.getTime() - currentQuarter.startDate.getTime()) / 86_400_000,
      ) + 1;
    const weekInQuarter = Math.max(1, Math.ceil(daysIn / 7));
    const weeksRemaining = Math.max(0, Math.ceil((totalDays - daysIn) / 7));

    return NextResponse.json({
      success: true,
      data: {
        phase: phaseFromDate,
        quarter: currentQuarter.quarter,
        year: currentQuarter.fiscalYear,
        startDate: currentQuarter.startDate.toISOString(),
        endDate: currentQuarter.endDate.toISOString(),
        weekInQuarter,
        weeksRemaining,
        userReview,
        goals: {
          active: activeGoalsCount,
          total: totalGoalsCount,
        },
        metrics: {
          orgReviewsPending,
          orgReviewsComplete,
          orgGoalsActive,
        },
      },
    });
  },
  { fallbackErrorMessage: "Failed to load performance cycle" },
);

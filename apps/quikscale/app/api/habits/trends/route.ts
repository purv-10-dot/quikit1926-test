import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { isOrgAdmin, forbidden } from "@/lib/api/permissions";
import { aggregateResponses } from "@/lib/schemas/habitSchema";
import { annotateRounds } from "@/lib/utils/habitRounds";

/**
 * GET /api/habits/trends  (admin only — system admin role)
 *
 * Returns the chronologically-ordered list of every non-legacy campaign with
 * its aggregate overall %, respondent count and round label. Powers the
 * Q-over-Q trend chart on the admin dashboard so executives can answer the
 * "are we improving?" question at a glance.
 *
 * Closed campaigns are the meaningful data points; draft campaigns are
 * excluded (no responses yet); active ones are included with their current
 * partial aggregate so admins see live progress mid-round.
 */
export const GET = withOrgAuth(
  async ({ orgId, userId }) => {
    if (!(await isOrgAdmin(userId, orgId))) return forbidden();

    const campaigns = await db.habitAssessment.findMany({
      where: { orgId, isLegacy: false, status: { in: ["active", "closed"] } },
      select: {
        id: true,
        quarter: true,
        year: true,
        status: true,
        createdAt: true,
        publishedAt: true,
        closedAt: true,
        isLegacy: true,
        responses: { select: { subItemBits: true } },
      },
      orderBy: [{ year: "asc" }, { quarter: "asc" }, { createdAt: "asc" }],
    });

    const annotated = annotateRounds(campaigns);
    const points = annotated.map((c) => {
      const agg = aggregateResponses(c.responses);
      return {
        id: c.id,
        quarter: c.quarter,
        year: c.year,
        round: c.round,
        totalRounds: c.totalRounds,
        status: c.status,
        overallPct: agg.overallPct,
        respondentCount: agg.respondentCount,
        label:
          c.totalRounds > 1
            ? `${c.quarter} ${c.year} · R${c.round}`
            : `${c.quarter} ${c.year}`,
        completedAt: c.closedAt?.toISOString() ?? c.publishedAt?.toISOString() ?? c.createdAt.toISOString(),
      };
    });

    return NextResponse.json({ success: true, data: points });
  },
  { moduleKey: "habits", fallbackErrorMessage: "Failed to load habit trends" },
);

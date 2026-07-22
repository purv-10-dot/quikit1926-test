import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";

/**
 * GET /api/v1/hrms/recruit/requisitions/:id/held-candidates
 * Candidates parked (AppOnHold) on this requisition — shown on the Resume review
 * screen with their latest stage feedback so the recruiter can decide who to
 * restore / reject / keep in archive.
 */
export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const apps = await prisma.jobApplication.findMany({
      where: { orgId, requisitionId: params.id, deletedAt: null, status: "AppOnHold" },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        currentStage: true,
        reconfirmSentAt: true,
        candidate: {
          select: { id: true, firstName: true, lastName: true, email: true, currentDesignation: true, totalExperience: true },
        },
        interviews: {
          where: { deletedAt: null, overallRating: { not: null } },
          orderBy: { scorecardSubmittedAt: "desc" },
          take: 1,
          select: {
            round: true, overallRating: true, recommendation: true,
            strengths: true, concerns: true, overallComments: true, scorecardSubmittedAt: true,
          },
        },
      },
    });

    const data = apps.map((a) => ({
      id: a.id,
      currentStage: a.currentStage,
      reconfirmSentAt: a.reconfirmSentAt,
      candidate: a.candidate,
      feedback: a.interviews[0] ?? null,
    }));

    return successResponse(data);
  } catch (error) {
    console.error("GET /recruit/requisitions/:id/held-candidates error:", error);
    return internalError();
  }
});

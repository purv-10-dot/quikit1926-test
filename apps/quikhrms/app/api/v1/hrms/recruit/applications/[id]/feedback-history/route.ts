import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, internalError } from "@/lib/api-response";
import { stageNames } from "@/lib/services/pipeline-stages";

/**
 * GET /api/v1/hrms/recruit/applications/:id/feedback-history
 * Returns chronological scorecard history with stage name, interviewer, rating,
 * recommendation, strengths, concerns, comments, and submission timestamp.
 */
export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const app = await prisma.jobApplication.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: {
        id: true,
        currentStage: true,
        requisition: { select: { pipelineId: true } },
      },
    });
    if (!app) return notFound("Application not found");

    const pipeline = await prisma.hiringPipeline.findFirst({
      where: {
        orgId, deletedAt: null,
        ...(app.requisition?.pipelineId ? { id: app.requisition.pipelineId } : { isDefault: true }),
      },
    });
    const names = stageNames(pipeline?.stages);

    // Scorecard data now lives on the interview row (overallRating set = submitted).
    const interviews = await prisma.interview.findMany({
      where: { orgId, applicationId: params.id, deletedAt: null, overallRating: { not: null } },
      orderBy: { scorecardSubmittedAt: "asc" },
      select: {
        id: true,
        round: true,
        type: true,
        scheduledAt: true,
        duration: true,
        status: true,
        overallRating: true,
        recommendation: true,
        strengths: true,
        concerns: true,
        overallComments: true,
        criteria: true,
        scorecardSubmittedAt: true,
        interviewer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            jobTitle: true,
            profilePhoto: true,
            employeeCode: true,
          },
        },
      },
    });

    const history = interviews.map((s) => {
      const stageName = names[s.round - 1] ?? `Round ${s.round}`;
      const interviewer = s.interviewer;
      return {
        id: s.id,
        stage: stageName,
        round: s.round,
        overallRating: s.overallRating,
        recommendation: s.recommendation,
        strengths: s.strengths,
        concerns: s.concerns,
        overallComments: s.overallComments,
        criteria: s.criteria,
        submittedAt: s.scorecardSubmittedAt,
        interview: {
          id: s.id,
          type: s.type,
          scheduledAt: s.scheduledAt,
          duration: s.duration,
          status: s.status,
        },
        interviewer: {
          id: interviewer.id,
          name: `${interviewer.firstName} ${interviewer.lastName}`.trim(),
          jobTitle: interviewer.jobTitle,
          employeeCode: interviewer.employeeCode,
          profilePhoto: interviewer.profilePhoto,
        },
      };
    });

    return successResponse({
      applicationId: app.id,
      currentStage: app.currentStage,
      stages: names,
      history,
    });
  } catch (error) {
    console.error("GET /recruit/applications/:id/feedback-history error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.recruit.read"] });

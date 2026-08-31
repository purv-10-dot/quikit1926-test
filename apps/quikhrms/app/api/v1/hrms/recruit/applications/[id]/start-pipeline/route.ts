import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { stageNames } from "@/lib/services/pipeline-stages";

/**
 * POST /api/v1/hrms/recruit/applications/:id/start-pipeline
 *
 * Moves a "pending review" application (currentStage still null — the state
 * every website apply lands in, see .../job-requisitions/external/apply)
 * onto the Hiring Pipeline board for the first time, at the requisition's
 * pipeline's first stage. HR triggers this explicitly from the Candidates →
 * Active list once they've reviewed the application — it never happens
 * automatically on the apply itself.
 */
export const POST = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const application = await prisma.jobApplication.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: { id: true, candidateId: true, currentStage: true, requisition: { select: { pipelineId: true } } },
    });
    if (!application) return notFound("Application not found");
    if (application.currentStage) return validationError("This application is already on the pipeline.");

    const pipeline = await prisma.hiringPipeline.findFirst({
      where: { orgId, deletedAt: null, ...(application.requisition.pipelineId ? { id: application.requisition.pipelineId } : { isDefault: true }) },
      select: { stages: true },
    });
    const stages = stageNames(pipeline?.stages);
    const initialStage = stages[0] ?? "Screening";

    const updated = await prisma.jobApplication.update({
      where: { id: application.id },
      data: {
        currentStage: initialStage,
        stageHistory: [{ stage: initialStage, date: new Date().toISOString(), movedBy: userId }],
        updatedBy: userId,
      },
    });
    await prisma.candidate.update({ where: { id: application.candidateId }, data: { status: "InPipeline" } });

    return successResponse(updated);
  } catch (error) {
    console.error("POST /recruit/applications/:id/start-pipeline error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.recruit.write", "hrms.recruit.candidate.write"], anyPermission: true });

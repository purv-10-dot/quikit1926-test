import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { stageNames } from "@/lib/services/pipeline-stages";

/**
 * Resume an ON-HOLD candidate — bring their held application back into the
 * pipeline at a chosen stage (defaults to the stage they were held at).
 * Distinct from a plain un-archive: the recruiter picks the target stage.
 */

// Find the candidate's held application (AppOnHold) + its pipeline stages.
async function loadHeldContext(orgId: string, candidateId: string) {
  const app = await prisma.jobApplication.findFirst({
    where: { orgId, candidateId, deletedAt: null, status: "AppOnHold" },
    orderBy: { updatedAt: "desc" },
    include: { requisition: { select: { id: true, title: true, pipelineId: true } } },
  });
  if (!app) return null;
  const pipeline = await prisma.hiringPipeline.findFirst({
    where: { orgId, deletedAt: null, ...(app.requisition?.pipelineId ? { id: app.requisition.pipelineId } : { isDefault: true }) },
    select: { stages: true },
  });
  const stages = stageNames(pipeline?.stages);
  return { app, stages, heldStage: app.currentStage ?? stages[0] ?? "Screening" };
}

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const ctx = await loadHeldContext(orgId, params.id);
    if (!ctx) return notFound("No on-hold application found for this candidate");
    return successResponse({
      applicationId: ctx.app.id,
      requisitionTitle: ctx.app.requisition?.title ?? "the role",
      heldStage: ctx.heldStage,
      stages: ctx.stages,
    });
  } catch (error) {
    console.error("GET /recruit/candidates/:id/resume error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.recruit.read"] });

const bodySchema = z.object({ stage: z.string().optional() });

export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return validationError("Validation failed");

    const ctx = await loadHeldContext(orgId, params.id);
    if (!ctx) return validationError("This candidate has no on-hold application to resume.");

    const targetStage = parsed.data.stage?.trim() || ctx.heldStage;
    if (ctx.stages.length && !ctx.stages.includes(targetStage)) {
      return validationError(`"${targetStage}" is not a valid stage for this pipeline.`);
    }

    const prevHistory = Array.isArray(ctx.app.stageHistory) ? (ctx.app.stageHistory as unknown[]) : [];
    await prisma.jobApplication.update({
      where: { id: ctx.app.id },
      data: {
        status: "AppActive",
        currentStage: targetStage,
        stageHistory: JSON.parse(JSON.stringify([...prevHistory, { stage: targetStage, date: new Date().toISOString(), movedBy: userId, note: "Resumed from hold" }])),
        updatedBy: userId,
      },
    });

    // Bring the candidate back to the active pipeline.
    await prisma.candidate.update({
      where: { id: params.id },
      data: { isArchived: false, archiveReason: null, archivedAt: null, archivedBy: null, status: "InPipeline", updatedBy: userId },
    });

    return successResponse({ resumed: true, stage: targetStage, applicationId: ctx.app.id });
  } catch (error) {
    console.error("POST /recruit/candidates/:id/resume error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.recruit.write", "hrms.recruit.candidate.write"], anyPermission: true });

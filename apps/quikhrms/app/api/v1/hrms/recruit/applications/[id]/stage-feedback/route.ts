import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { stageNames } from "@/lib/services/pipeline-stages";

/**
 * POST /api/v1/hrms/recruit/applications/:id/stage-feedback
 * Records a feedback/scorecard for the application's current stage.
 * - Creates a zero-duration Interview row for that stage if none exists.
 * - Creates a Scorecard linked to the interview.
 * - Advances application.currentStage for Hire/StrongHire, marks AppRejected for NoHire/StrongNoHire.
 */
export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const body = await req.json();
    const overallRating = Number(body.overallRating);
    const recommendation = String(body.recommendation ?? "");
    if (!overallRating || overallRating < 1 || overallRating > 5) {
      return validationError("Rating must be between 1 and 5");
    }
    if (!["StrongHire", "Hire", "MaybeHire", "NoHire", "StrongNoHire"].includes(recommendation)) {
      return validationError("Invalid recommendation");
    }

    const app = await prisma.jobApplication.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!app) return notFound("Application not found");

    const pipeline = await prisma.hiringPipeline.findFirst({
      where: { orgId, deletedAt: null, isDefault: true },
    });
    const stages = stageNames(pipeline?.stages);
    const currentStage = app.currentStage ?? stages[0] ?? "Screening";
    const currentIdx = stages.indexOf(currentStage);
    const round = currentIdx >= 0 ? currentIdx + 1 : 1;

    const interviewerId = await resolveEmployeeId(orgId, userId);
    if (!interviewerId) return validationError("Interviewer employee record not found");

    // Reuse latest interview for this stage, or create a minimal one.
    let interview = await prisma.interview.findFirst({
      where: { orgId, applicationId: app.id, round, deletedAt: null },
      orderBy: { scheduledAt: "desc" },
    });
    if (!interview) {
      interview = await prisma.interview.create({
        data: {
          orgId,
          applicationId: app.id,
          round,
          type: "Video",
          interviewerId,
          scheduledAt: new Date(),
          duration: 0,
          status: "IntCompleted",
          createdBy: userId,
          updatedBy: userId,
        },
      });
    } else {
      await prisma.interview.update({
        where: { id: interview.id },
        data: { status: "IntCompleted", updatedBy: userId },
      });
    }

    // Scorecard now lives on the interview row; overwrite it (re-feedback allowed).
    const updatedIv = await prisma.interview.update({
      where: { id: interview.id },
      data: {
        overallRating,
        recommendation: recommendation as "StrongHire" | "Hire" | "MaybeHire" | "NoHire" | "StrongNoHire",
        strengths: body.strengths || undefined,
        concerns: body.concerns || undefined,
        overallComments: body.overallComments || undefined,
        scorecardSubmittedAt: new Date(),
      },
    });
    const sc = {
      id: updatedIv.id, interviewId: updatedIv.id, applicationId: app.id,
      overallRating: updatedIv.overallRating, recommendation: updatedIv.recommendation,
      strengths: updatedIv.strengths, concerns: updatedIv.concerns,
      overallComments: updatedIv.overallComments, submittedAt: updatedIv.scorecardSubmittedAt,
    };

    // Apply decision
    const deferStageMove = body.deferStageMove === true;
    let stageAdvanced = false;
    if ((recommendation === "Hire" || recommendation === "StrongHire") && !deferStageMove) {
      const nextStage = currentIdx >= 0 && currentIdx < stages.length - 1
        ? stages[currentIdx + 1]
        : currentStage;
      if (nextStage && nextStage !== currentStage) {
        const history = Array.isArray(app.stageHistory) ? (app.stageHistory as unknown[]) : [];
        await prisma.jobApplication.update({
          where: { id: app.id },
          data: {
            currentStage: nextStage,
            stageHistory: JSON.parse(JSON.stringify([
              ...history,
              { stage: nextStage, date: new Date().toISOString(), movedBy: userId, reason: `Approved at ${currentStage}` },
            ])),
            updatedBy: userId,
          },
        });
        stageAdvanced = true;
      }
    } else if (recommendation === "NoHire" || recommendation === "StrongNoHire") {
      await prisma.jobApplication.update({
        where: { id: app.id },
        data: {
          status: "AppRejected",
          rejectionStage: currentStage,
          rejectionReason: body.concerns || body.overallComments || "Rejected via stage feedback",
          updatedBy: userId,
        },
      });
    }

    return successResponse({ scorecard: sc, interviewId: interview.id, stageAdvanced }, undefined, 201);
  } catch (error) {
    console.error("POST /recruit/applications/:id/stage-feedback error:", error);
    return internalError();
  }
});

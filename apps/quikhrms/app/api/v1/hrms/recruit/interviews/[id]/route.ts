import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { updateInterviewSchema, createScorecardSchema } from "@/lib/validations/recruit";
import { stageNames } from "@/lib/services/pipeline-stages";

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const i = await prisma.interview.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: {
        interviewer: { select: { id: true, firstName: true, lastName: true } },
        application: { include: { candidate: true, requisition: { select: { title: true } } } },
      },
    });
    if (!i) return notFound("Interview not found");
    // Scorecard fields now live on the interview row; expose them under the
    // historical `scorecard` shape so existing consumers keep working.
    return successResponse({
      ...i,
      scorecard: i.overallRating != null
        ? {
            id: i.id, interviewId: i.id, applicationId: i.applicationId,
            overallRating: i.overallRating, recommendation: i.recommendation,
            criteria: i.criteria, strengths: i.strengths, concerns: i.concerns,
            overallComments: i.overallComments, submittedAt: i.scorecardSubmittedAt,
          }
        : null,
    });
  } catch (error) { console.error("GET /recruit/interviews/:id error:", error); return internalError(); }
});

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.interview.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("Interview not found");
    const body = await req.json();

    // Check if it's a scorecard submission
    if (body.overallRating !== undefined) {
      const parsed = createScorecardSchema.safeParse({ ...body, interviewId: params.id, applicationId: existing.applicationId });
      if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

      const updated = await prisma.interview.update({
        where: { id: params.id },
        data: {
          overallRating: parsed.data.overallRating,
          recommendation: parsed.data.recommendation,
          criteria: parsed.data.criteria ? JSON.parse(JSON.stringify(parsed.data.criteria)) : undefined,
          strengths: parsed.data.strengths, concerns: parsed.data.concerns,
          overallComments: parsed.data.overallComments,
          scorecardSubmittedAt: new Date(),
          status: "IntCompleted", updatedBy: userId,
        },
      });
      const sc = {
        id: updated.id, interviewId: updated.id, applicationId: existing.applicationId,
        overallRating: updated.overallRating, recommendation: updated.recommendation,
        criteria: updated.criteria, strengths: updated.strengths, concerns: updated.concerns,
        overallComments: updated.overallComments, submittedAt: updated.scorecardSubmittedAt,
      };

      // Auto-advance / reject based on recommendation
      const rec = parsed.data.recommendation;
      if (rec === "Hire" || rec === "StrongHire") {
        const pipeline = await prisma.hiringPipeline.findFirst({
          where: { orgId, deletedAt: null, isDefault: true },
        });
        const stages = stageNames(pipeline?.stages);
        if (stages.length > 0) {
          const app = await prisma.jobApplication.findFirst({
            where: { id: existing.applicationId, orgId, deletedAt: null },
            select: { currentStage: true },
          });
          const currentIdx = app?.currentStage ? stages.indexOf(app.currentStage) : -1;
          const nextStage = currentIdx >= 0 && currentIdx < stages.length - 1
            ? stages[currentIdx + 1]
            : stages[Math.min(stages.length - 1, Math.max(0, currentIdx + 1))];
          if (nextStage && nextStage !== app?.currentStage) {
            await prisma.jobApplication.update({
              where: { id: existing.applicationId },
              data: { currentStage: nextStage, updatedBy: userId },
            });
          }
        }
      } else if (rec === "NoHire" || rec === "StrongNoHire") {
        await prisma.jobApplication.update({
          where: { id: existing.applicationId },
          data: { status: "AppRejected", updatedBy: userId },
        });
      }

      return successResponse(sc, undefined, 201);
    }

    const parsed = updateInterviewSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const data = parsed.data;
    const i = await prisma.interview.update({
      where: { id: params.id },
      data: {
        ...(data.status && { status: data.status }),
        ...(data.scheduledAt && { scheduledAt: new Date(data.scheduledAt) }),
        ...(data.candidateFeedback && { candidateFeedback: data.candidateFeedback }),
        updatedBy: userId,
      },
    });
    return successResponse(i);
  } catch (error) { console.error("PATCH /recruit/interviews/:id error:", error); return internalError(); }
});

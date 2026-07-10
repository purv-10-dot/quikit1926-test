import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { updateInterviewSchema, createScorecardSchema } from "@/lib/validations/recruit";

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

      // Submitting feedback does NOT auto-advance the pipeline stage. Advancing
      // is a deliberate action from the pipeline UI (PATCH /applications/:id),
      // which (a) requires this feedback to exist before moving and (b) creates
      // the next stage's interview stub. Auto-advancing here bypassed both and
      // pushed candidates into the next stage with no interview scheduled.
      //
      // A strongly negative recommendation still auto-rejects the application —
      // rejection is terminal and needs no downstream scheduling.
      const rec = parsed.data.recommendation;
      if (rec === "NoHire" || rec === "StrongNoHire") {
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

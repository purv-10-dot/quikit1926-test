import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { surveyResponseSchema } from "@/lib/validations/engage";
import { fireWorkflow } from "@/lib/workflows/executor";

export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const survey = await prisma.hrmsSurvey.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!survey) return notFound("Survey not found");
    if (survey.status !== "SurveyActive") return validationError("Survey is not active");

    const body = await req.json();
    const parsed = surveyResponseSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const response = await prisma.hrmsSurveyResponse.create({
      data: {
        orgId, surveyId: params.id,
        employeeId: survey.isAnonymous ? null : userId,
        answers: JSON.parse(JSON.stringify(parsed.data.answers)),
      },
    });

    // Update response rate
    const totalResponses = await prisma.hrmsSurveyResponse.count({ where: { surveyId: params.id } });
    const totalEmployees = await prisma.employee.count({ where: { orgId, deletedAt: null, status: "Active" } });
    if (totalEmployees > 0) {
      await prisma.hrmsSurvey.update({
        where: { id: params.id },
        data: { responseRate: Math.round((totalResponses / totalEmployees) * 10000) / 100 },
      });
    }

    void fireWorkflow({
      orgId, event: "engage.survey.responded",
      payload: {
        surveyId: params.id,
        employeeId: survey.isAnonymous ? null : userId,
        responseId: response.id,
      },
    });

    return successResponse(response, undefined, 201);
  } catch (error) { console.error("POST /engage/surveys/:id/respond error:", error); return internalError(); }
});

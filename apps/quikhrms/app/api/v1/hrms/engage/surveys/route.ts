import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createSurveySchema } from "@/lib/validations/engage";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { fireWorkflow } from "@/lib/workflows/executor";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const status = searchParams.get("status");
    const where = { orgId, deletedAt: null, ...(status && { status: status as "SurveyDraft" | "SurveyActive" | "SurveyClosed" }) };

    const [surveys, total] = await Promise.all([
      prisma.hrmsSurvey.findMany({
        where, orderBy: { startDate: "desc" }, skip: (page - 1) * limit, take: limit,
        include: { _count: { select: { responses: true } } },
      }),
      prisma.hrmsSurvey.count({ where }),
    ]);
    return successResponse(surveys, paginationMeta(page, limit, total));
  } catch (error) { console.error("GET /engage/surveys error:", error); return internalError(); }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createSurveySchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const data = parsed.data;
    const survey = await prisma.hrmsSurvey.create({
      data: {
        orgId, title: data.title, type: data.type,
        questions: JSON.parse(JSON.stringify(data.questions)),
        audience: data.audience ? JSON.parse(JSON.stringify(data.audience)) : undefined,
        isAnonymous: data.isAnonymous,
        startDate: new Date(data.startDate), endDate: new Date(data.endDate),
        recurrence: data.recurrence,
        createdBy: userId, updatedBy: userId,
      },
    });
    if (survey.status === "SurveyActive") {
      void fireWorkflow({
        orgId, event: "engage.survey.published",
        payload: { surveyId: survey.id, title: survey.title, type: survey.type },
      });
    }

    return successResponse(survey, undefined, 201);
  } catch (error) { console.error("POST /engage/surveys error:", error); return internalError(); }
});

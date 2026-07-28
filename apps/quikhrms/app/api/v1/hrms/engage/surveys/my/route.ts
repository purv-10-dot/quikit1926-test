import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { audienceMatches } from "@/lib/services/survey-audience";

export const GET = withAuth(async (_req: NextRequest, { orgId, userId }) => {
  try {
    const employeeId = await resolveEmployeeId(orgId, userId);
    if (!employeeId) return successResponse([]);

    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, orgId, deletedAt: null },
      select: { departmentId: true, employmentType: true },
    });
    if (!employee) return successResponse([]);

    const surveys = await prisma.hrmsSurvey.findMany({
      where: {
        orgId, deletedAt: null, status: "SurveyActive",
      },
      orderBy: { endDate: "asc" },
      select: {
        id: true, title: true, type: true, isAnonymous: true,
        startDate: true, endDate: true, audience: true, questions: true,
      },
    });

    const matches = surveys.filter((s) => audienceMatches(s.audience, employee));

    const responses = matches.length === 0 ? [] : await prisma.hrmsSurveyResponse.findMany({
      where: { orgId, employeeId, surveyId: { in: matches.map((s) => s.id) } },
      select: { surveyId: true },
    });
    const responded = new Set(responses.map((r) => r.surveyId));

    const result = matches.map((s) => {
      const qs = Array.isArray(s.questions) ? s.questions : [];
      return {
        id: s.id, title: s.title, type: s.type, isAnonymous: s.isAnonymous,
        startDate: s.startDate, endDate: s.endDate,
        questionCount: qs.length,
        hasResponded: responded.has(s.id),
      };
    });

    return successResponse(result);
  } catch (error) {
    console.error("GET /engage/surveys/my error:", error);
    return internalError();
  }
});

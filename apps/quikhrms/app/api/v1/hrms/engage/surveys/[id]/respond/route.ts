import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, forbidden, validationError, internalError } from "@/lib/api-response";
import { surveyResponseSchema } from "@/lib/validations/engage";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { audienceMatches } from "@/lib/services/survey-audience";
import { fireWorkflow } from "@/lib/workflows/executor";

/** Recognise a unique-constraint violation from either a Prisma create (P2002)
 *  or a raw INSERT (Postgres 23505). */
function isUniqueViolation(e: unknown): boolean {
  const code = (e as { code?: string }).code;
  const msg = e instanceof Error ? e.message : String(e);
  return code === "P2002" || code === "23505" || /duplicate key|unique constraint/i.test(msg);
}

export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const survey = await prisma.hrmsSurvey.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!survey) return notFound("Survey not found");
    if (survey.status !== "SurveyActive") return validationError("Survey is not active");

    const meId = await resolveEmployeeId(orgId, userId);
    if (!meId) return validationError("Employee record not found");

    // Audience gate — the survey must be addressed to this caller.
    const emp = await prisma.employee.findFirst({
      where: { id: meId, orgId, deletedAt: null },
      select: { departmentId: true, employmentType: true },
    });
    if (!emp) return validationError("Employee record not found");
    if (!audienceMatches(survey.audience, emp)) return forbidden("This survey isn't addressed to you");

    // One response per caller — for anonymous surveys too. The "responded" marker
    // lives in a SEPARATE table (SurveyRespondent) keyed by employee, so the
    // answer row itself stays unlinked to the person. Pre-check, then rely on the
    // unique constraint to catch races.
    const marker = await prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "app_quikhrms"."SurveyRespondent"
      WHERE "orgId" = ${orgId} AND "surveyId" = ${params.id} AND "employeeId" = ${meId} LIMIT 1`;
    if (marker.length) return validationError("You have already responded to this survey");

    const body = await req.json();
    const parsed = surveyResponseSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    let response;
    try {
      response = await prisma.$transaction(async (tx) => {
        const r = await tx.hrmsSurveyResponse.create({
          data: {
            orgId, surveyId: params.id,
            // Anonymous responses store NO employeeId — answers stay unlinked.
            employeeId: survey.isAnonymous ? null : meId,
            answers: JSON.parse(JSON.stringify(parsed.data.answers)),
          },
        });
        await tx.$executeRaw`
          INSERT INTO "app_quikhrms"."SurveyRespondent" ("id", "orgId", "surveyId", "employeeId", "respondedAt")
          VALUES (${randomUUID()}, ${orgId}, ${params.id}, ${meId}, now())`;
        return r;
      });
    } catch (e) {
      if (isUniqueViolation(e)) return validationError("You have already responded to this survey");
      throw e;
    }

    // Response rate — capped at 100 (guards against any count/headcount drift).
    const totalResponses = await prisma.hrmsSurveyResponse.count({ where: { surveyId: params.id } });
    const totalEmployees = await prisma.employee.count({ where: { orgId, deletedAt: null, status: "Active" } });
    if (totalEmployees > 0) {
      await prisma.hrmsSurvey.update({
        where: { id: params.id },
        data: { responseRate: Math.min(100, Math.round((totalResponses / totalEmployees) * 10000) / 100) },
      });
    }

    void fireWorkflow({
      orgId, event: "engage.survey.responded",
      payload: { surveyId: params.id, employeeId: survey.isAnonymous ? null : meId, responseId: response.id },
    });

    return successResponse(response, undefined, 201);
  } catch (error) { console.error("POST /engage/surveys/:id/respond error:", error); return internalError(); }
});

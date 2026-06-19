import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { updateSurveySchema } from "@/lib/validations/engage";

export const GET = withAuth(async (_req: NextRequest, { orgId, permissions }, params) => {
  try {
    const isAdmin = permissions.includes("*") || permissions.includes("hrms.engage.manage");
    const survey = await prisma.hrmsSurvey.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: {
        ...(isAdmin && { responses: { select: { id: true, answers: true, submittedAt: true } } }),
        _count: { select: { responses: true } },
      },
    });
    if (!survey) return notFound("Survey not found");
    return successResponse(survey);
  } catch (error) { console.error("GET /engage/surveys/:id error:", error); return internalError(); }
});

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.hrmsSurvey.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("Survey not found");
    const body = await req.json();
    const parsed = updateSurveySchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    const survey = await prisma.hrmsSurvey.update({ where: { id: params.id }, data: { ...parsed.data, updatedBy: userId } });

    if (existing.status !== "SurveyActive" && survey.status === "SurveyActive") {
      void fanOutSurveyNotifications({
        orgId, surveyId: survey.id, title: survey.title, audience: survey.audience,
        endDate: survey.endDate,
      });
    }

    return successResponse(survey);
  } catch (error) { console.error("PATCH /engage/surveys/:id error:", error); return internalError(); }
});

async function fanOutSurveyNotifications(args: {
  orgId: string; surveyId: string; title: string; audience: unknown; endDate: Date;
}) {
  try {
    const { orgId, surveyId, title, audience, endDate } = args;
    const a = (audience && typeof audience === "object") ? audience as { departments?: string[]; employmentTypes?: string[] } : null;

    const recipients = await prisma.employee.findMany({
      where: {
        orgId, deletedAt: null, status: "Active",
        ...(a?.departments && a.departments.length > 0 && { departmentId: { in: a.departments } }),
        ...(a?.employmentTypes && a.employmentTypes.length > 0 && { employmentType: { in: a.employmentTypes as ("FullTime")[] } }),
      },
      select: { id: true },
    });
    if (recipients.length === 0) return;

    const due = endDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
    await prisma.hrmsNotification.createMany({
      data: recipients.map((r) => ({
        orgId,
        employeeId: r.id,
        type: "Action" as const,
        channel: "InApp" as const,
        title: `📊 New survey: ${title}`,
        message: `Your input is requested. Closes ${due}.`,
        link: `/engage/surveys/${surveyId}/take`,
        entityType: "Survey",
        entityId: surveyId,
      })),
    });
  } catch (error) {
    console.error("fanOutSurveyNotifications error:", error);
  }
}

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.hrmsSurvey.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("Survey not found");
    await prisma.hrmsSurvey.update({ where: { id: params.id }, data: { deletedAt: new Date(), updatedBy: userId } });
    return successResponse({ deleted: true });
  } catch (error) { console.error("DELETE /engage/surveys/:id error:", error); return internalError(); }
});

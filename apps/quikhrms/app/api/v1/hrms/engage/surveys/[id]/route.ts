import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, forbidden, validationError, internalError } from "@/lib/api-response";
import { updateSurveySchema } from "@/lib/validations/engage";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { audienceMatches } from "@/lib/services/survey-audience";

// One-way lifecycle: a survey can only move forward through these stages.
const STATUS_ORDER = { SurveyDraft: 0, SurveyActive: 1, SurveyClosed: 2, SurveyAnalysed: 3 } as const;

export const GET = withAuth(async (_req: NextRequest, ctx, params) => {
  try {
    const { orgId, permissions } = ctx;
    const isAdmin = permissions.includes("*") || permissions.includes("hrms.engage.survey.manage");
    const survey = await prisma.hrmsSurvey.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: {
        ...(isAdmin && { responses: { select: { id: true, answers: true, submittedAt: true } } }),
        _count: { select: { responses: true } },
      },
    });
    if (!survey) return notFound("Survey not found");

    // Non-managers may only see an ACTIVE survey they're in the audience for.
    if (!isAdmin) {
      if (survey.status !== "SurveyActive") return notFound("Survey not found");
      const meId = await resolveEmployeeId(orgId, ctx.userId);
      const emp = meId
        ? await prisma.employee.findFirst({ where: { id: meId, orgId, deletedAt: null }, select: { departmentId: true, employmentType: true } })
        : null;
      if (!emp || !audienceMatches(survey.audience, emp)) return forbidden("This survey isn't addressed to you");
    }
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

    // Enforce the one-way lifecycle: no backward moves, no reopening Closed/Analysed.
    if (parsed.data.status && parsed.data.status !== existing.status) {
      const cur = STATUS_ORDER[existing.status as keyof typeof STATUS_ORDER];
      const next = STATUS_ORDER[parsed.data.status as keyof typeof STATUS_ORDER];
      if (next < cur) {
        return validationError("A survey can only move forward (Draft → Active → Closed → Analysed).");
      }
    }

    const survey = await prisma.hrmsSurvey.update({ where: { id: params.id }, data: { ...parsed.data, updatedBy: userId } });

    // Notify recipients only on the FIRST Draft → Active transition.
    if (existing.status === "SurveyDraft" && survey.status === "SurveyActive") {
      void fanOutSurveyNotifications({
        orgId, surveyId: survey.id, title: survey.title, audience: survey.audience,
        endDate: survey.endDate,
      });
    }

    return successResponse(survey);
  } catch (error) { console.error("PATCH /engage/surveys/:id error:", error); return internalError(); }
}, { requiredPermissions: ["hrms.engage.survey.manage"] });

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
}, { requiredPermissions: ["hrms.engage.survey.manage"] });

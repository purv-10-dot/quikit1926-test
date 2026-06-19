import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { updateEmployeeAppraisalSchema } from "@/lib/validations/performance";

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const appraisal = await prisma.employeeAppraisal.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true, profilePhoto: true, department: { select: { name: true } }, designation: { select: { title: true } } } },
        cycle: true,
      },
    });
    if (!appraisal) return notFound("Appraisal not found");
    return successResponse(appraisal);
  } catch (error) { console.error("GET /appraisals/employee/:id error:", error); return internalError(); }
});

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.employeeAppraisal.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("Appraisal not found");

    const body = await req.json();
    const parsed = updateEmployeeAppraisalSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const data = parsed.data;
    const updateData: Record<string, unknown> = { updatedBy: userId };

    if (data.selfRating !== undefined) updateData.selfRating = data.selfRating;
    if (data.selfComments !== undefined) updateData.selfComments = data.selfComments;
    if (data.selfResponses) updateData.selfResponses = JSON.parse(JSON.stringify(data.selfResponses));
    if (data.managerRating !== undefined) updateData.managerRating = data.managerRating;
    if (data.managerComments !== undefined) updateData.managerComments = data.managerComments;
    if (data.managerResponses) updateData.managerResponses = JSON.parse(JSON.stringify(data.managerResponses));
    if (data.calibratedRating !== undefined) updateData.calibratedRating = data.calibratedRating;
    if (data.finalRating !== undefined) updateData.finalRating = data.finalRating;
    if (data.finalBand !== undefined) updateData.finalBand = data.finalBand;
    if (data.promotionRecommendation !== undefined) updateData.promotionRecommendation = data.promotionRecommendation;
    if (data.salaryRevisionRecommended !== undefined) updateData.salaryRevisionRecommended = data.salaryRevisionRecommended;
    if (data.status) updateData.status = data.status;
    if (data.employeeAcknowledged) {
      updateData.employeeAcknowledged = true;
      updateData.employeeAcknowledgedAt = new Date();
    }
    if (data.employeeFeedback) updateData.employeeFeedback = data.employeeFeedback;

    const appraisal = await prisma.employeeAppraisal.update({
      where: { id: params.id }, data: updateData,
    });
    return successResponse(appraisal);
  } catch (error) { console.error("PATCH /appraisals/employee/:id error:", error); return internalError(); }
});

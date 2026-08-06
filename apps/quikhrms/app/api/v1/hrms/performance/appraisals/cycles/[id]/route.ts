import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { updateAppraisalCycleSchema } from "@/lib/validations/performance";

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const cycle = await prisma.appraisalCycle.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: {
        appraisals: {
          include: { employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true, department: { select: { name: true } } } } },
        },
      },
    });
    if (!cycle) return notFound("Cycle not found");
    return successResponse(cycle);
  } catch (error) { console.error("GET /appraisals/cycles/:id error:", error); return internalError(); }
}, { requiredPermissions: ["hrms.performance.appraise"] });

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.appraisalCycle.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("Cycle not found");
    const body = await req.json();
    const parsed = updateAppraisalCycleSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const { applicableTo, stages, startDate, endDate, ...rest } = parsed.data;
    const cycle = await prisma.appraisalCycle.update({
      where: { id: params.id },
      data: {
        ...rest,
        ...(startDate && { startDate: new Date(startDate) }),
        ...(endDate && { endDate: new Date(endDate) }),
        ...(applicableTo && { applicableTo: JSON.parse(JSON.stringify(applicableTo)) }),
        ...(stages && { stages: JSON.parse(JSON.stringify(stages)) }),
        updatedBy: userId,
      },
    });
    return successResponse(cycle);
  } catch (error) { console.error("PATCH /appraisals/cycles/:id error:", error); return internalError(); }
}, { requiredPermissions: ["hrms.performance.appraise"] });

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.appraisalCycle.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("Cycle not found");
    await prisma.appraisalCycle.update({ where: { id: params.id }, data: { deletedAt: new Date(), updatedBy: userId } });
    return successResponse({ deleted: true });
  } catch (error) { console.error("DELETE /appraisals/cycles/:id error:", error); return internalError(); }
}, { requiredPermissions: ["hrms.performance.appraise"] });

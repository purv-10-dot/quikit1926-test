import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { updateShiftPolicySchema } from "@/lib/validations/shift";

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const shift = await prisma.shiftPolicy.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: { assignments: { where: { deletedAt: null }, include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
      } } },
    });
    if (!shift) return notFound("Shift not found");
    return successResponse(shift);
  } catch (error) {
    console.error("GET /shifts/:id error:", error);
    return internalError();
  }
});

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.shiftPolicy.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!existing) return notFound("Shift not found");

    const body = await req.json();
    const parsed = updateShiftPolicySchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const shift = await prisma.shiftPolicy.update({
      where: { id: params.id },
      data: { ...parsed.data, updatedBy: userId },
    });
    return successResponse(shift);
  } catch (error) {
    console.error("PATCH /shifts/:id error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.attendance.manage"] });

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.shiftPolicy.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!existing) return notFound("Shift not found");

    await prisma.shiftPolicy.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });
    return successResponse({ deleted: true });
  } catch (error) {
    console.error("DELETE /shifts/:id error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.attendance.manage"] });

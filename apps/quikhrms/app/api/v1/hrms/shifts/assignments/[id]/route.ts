import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { updateShiftAssignmentSchema } from "@/lib/validations/shift";

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.shiftAssignment.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!existing) return notFound("Assignment not found");

    const body = await req.json();
    const parsed = updateShiftAssignmentSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const data = parsed.data;
    const assignment = await prisma.shiftAssignment.update({
      where: { id: params.id },
      data: {
        ...(data.shiftId && { shiftId: data.shiftId }),
        ...(data.effectiveFrom && { effectiveFrom: new Date(data.effectiveFrom) }),
        ...(data.effectiveTo !== undefined && { effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null }),
        ...(data.isRotating !== undefined && { isRotating: data.isRotating }),
        ...(data.rotationPattern !== undefined && { rotationPattern: data.rotationPattern ? JSON.parse(JSON.stringify(data.rotationPattern)) : null }),
        updatedBy: userId,
      },
    });
    return successResponse(assignment);
  } catch (error) {
    console.error("PATCH /shifts/assignments/:id error:", error);
    return internalError();
  }
});

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.shiftAssignment.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!existing) return notFound("Assignment not found");

    await prisma.shiftAssignment.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });
    return successResponse({ deleted: true });
  } catch (error) {
    console.error("DELETE /shifts/assignments/:id error:", error);
    return internalError();
  }
});

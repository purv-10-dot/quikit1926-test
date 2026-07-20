import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { updateLeaveTypeSchema } from "@/lib/validations/leave";

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const leaveType = await prisma.leaveType.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!leaveType) return notFound("Leave type not found");
    return successResponse(leaveType);
  } catch (error) {
    console.error("GET /leaves/types/:id error:", error);
    return internalError();
  }
});

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.leaveType.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!existing) return notFound("Leave type not found");

    const body = await req.json();
    const parsed = updateLeaveTypeSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const leaveType = await prisma.leaveType.update({
      where: { id: params.id },
      data: { ...parsed.data, updatedBy: userId },
    });

    // Propagate maxBalance change to current-year LeaveBalance rows
    if (
      parsed.data.maxBalance !== undefined &&
      Number(parsed.data.maxBalance) !== Number(existing.maxBalance)
    ) {
      const year = new Date().getFullYear();
      await prisma.leaveBalance.updateMany({
        where: { orgId, leaveTypeId: params.id, year, deletedAt: null },
        data: { opening: parsed.data.maxBalance, updatedBy: userId },
      });
    }

    return successResponse(leaveType);
  } catch (error) {
    console.error("PATCH /leaves/types/:id error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.leave.manage"] });

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.leaveType.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!existing) return notFound("Leave type not found");

    await prisma.leaveType.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });
    return successResponse({ deleted: true });
  } catch (error) {
    console.error("DELETE /leaves/types/:id error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.leave.manage"] });

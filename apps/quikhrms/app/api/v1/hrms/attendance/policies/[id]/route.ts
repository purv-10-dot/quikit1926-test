import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { updateAttendancePolicySchema } from "@/lib/validations/attendance";

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const policy = await prisma.attendancePolicy.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!policy) return notFound("Policy not found");
    return successResponse(policy);
  } catch (error) {
    console.error("GET /attendance/policies/:id error:", error);
    return internalError();
  }
});

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.attendancePolicy.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!existing) return notFound("Policy not found");

    const body = await req.json();
    const parsed = updateAttendancePolicySchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const policy = await prisma.attendancePolicy.update({
      where: { id: params.id },
      data: { ...parsed.data, updatedBy: userId },
    });
    return successResponse(policy);
  } catch (error) {
    console.error("PATCH /attendance/policies/:id error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.attendance.manage"] });

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.attendancePolicy.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!existing) return notFound("Policy not found");

    await prisma.attendancePolicy.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });
    return successResponse({ deleted: true });
  } catch (error) {
    console.error("DELETE /attendance/policies/:id error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.attendance.manage"] });

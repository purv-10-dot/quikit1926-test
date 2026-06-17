import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, forbidden, validationError, internalError } from "@/lib/api-response";
import { updateLeaveRequestSchema } from "@/lib/validations/leave";
import { canAccessEmployee } from "@/lib/rbac/hierarchy";

/** GET /api/v1/hrms/leaves/requests/:id */
export const GET = withAuth(async (_req: NextRequest, ctx, params) => {
  try {
    const { orgId } = ctx;
    const request = await prisma.leaveRequest.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: {
        employee: {
          select: {
            id: true, firstName: true, lastName: true, employeeCode: true, profilePhoto: true,
            department: { select: { name: true } }, designation: { select: { title: true } },
          },
        },
        leaveType: true,
        approvals: {
          include: { approver: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { level: "asc" },
        },
      },
    });
    if (!request) return notFound("Leave request not found");

    // Hierarchy guard
    const allowed = await canAccessEmployee(ctx, request.employeeId);
    if (!allowed) return forbidden("Cannot view leaves of an employee above your role hierarchy");

    return successResponse(request);
  } catch (error) {
    console.error("GET /leaves/requests/:id error:", error);
    return internalError();
  }
});

/** PATCH /api/v1/hrms/leaves/requests/:id — cancel/recall */
export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.leaveRequest.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!existing) return notFound("Leave request not found");

    const body = await req.json();
    const parsed = updateLeaveRequestSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const data = parsed.data;

    if (data.status === "Cancelled" || data.status === "Recalled") {
      // If cancelling an approved leave, restore balance
      if (existing.status === "Approved") {
        const currentYear = new Date(existing.startDate).getFullYear();
        await prisma.leaveBalance.updateMany({
          where: {
            orgId,
            employeeId: existing.employeeId,
            leaveTypeId: existing.leaveTypeId,
            year: currentYear,
          },
          data: { taken: { decrement: existing.duration } },
        });
      }
    }

    const request = await prisma.leaveRequest.update({
      where: { id: params.id },
      data: {
        status: data.status,
        cancelReason: data.cancelReason,
        reason: data.reason ?? existing.reason,
        updatedBy: userId,
      },
    });
    return successResponse(request);
  } catch (error) {
    console.error("PATCH /leaves/requests/:id error:", error);
    return internalError();
  }
});

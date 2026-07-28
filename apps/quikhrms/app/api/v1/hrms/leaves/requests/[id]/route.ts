import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, forbidden, validationError, conflict, internalError } from "@/lib/api-response";
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
export const PATCH = withAuth(async (req: NextRequest, ctx, params) => {
  const { orgId, userId } = ctx;
  try {
    const existing = await prisma.leaveRequest.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!existing) return notFound("Leave request not found");

    // Ownership / hierarchy guard: only the request's owner (self), a manager
    // above them, or an admin may cancel/recall. Without this any employee in
    // the tenant could cancel another's leave and mutate their balance.
    const allowed = await canAccessEmployee(ctx, existing.employeeId);
    if (!allowed) return forbidden("You cannot modify this leave request");

    const body = await req.json();
    const parsed = updateLeaveRequestSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const data = parsed.data;

    if (data.status === "Cancelled" || data.status === "Recalled") {
      // Can't cancel/recall leave that has already started — those days are taken;
      // refunding them would hand back balance for time already off.
      if (existing.status === "Approved" && new Date(existing.startDate) <= new Date()) {
        return validationError("You can't cancel leave that has already started.");
      }
      const result = await prisma.$transaction(async (tx) => {
        // Atomic claim — only transition from the current status once, so two
        // parallel cancels can't both refund (single credit).
        const claimed = await tx.leaveRequest.updateMany({
          where: { id: params.id, status: existing.status },
          data: { status: data.status, cancelReason: data.cancelReason, reason: data.reason ?? existing.reason, updatedBy: userId },
        });
        if (claimed.count === 0) throw new Error("ALREADY_ACTIONED");
        // Refund only a previously-approved (future) leave.
        if (existing.status === "Approved") {
          const currentYear = new Date(existing.startDate).getFullYear();
          await tx.leaveBalance.updateMany({
            where: { orgId, employeeId: existing.employeeId, leaveTypeId: existing.leaveTypeId, year: currentYear },
            data: { taken: { decrement: existing.duration } },
          });
        }
        return tx.leaveRequest.findFirst({ where: { id: params.id } });
      });
      return successResponse(result);
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
    if (error instanceof Error && error.message === "ALREADY_ACTIONED") {
      return conflict("This leave request was just updated by someone else.");
    }
    console.error("PATCH /leaves/requests/:id error:", error);
    return internalError();
  }
});

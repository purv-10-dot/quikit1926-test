import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError, forbidden, conflict } from "@/lib/api-response";
import { regularizationSchema, regularizationActionSchema } from "@/lib/validations/attendance";
import { getCallerEmployeeId, getCallerReporteeIds } from "@/lib/rbac/scope";
import { fireWorkflow } from "@/lib/workflows/executor";

/** GET /api/v1/hrms/attendance/records/:id */
export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const record = await prisma.attendanceRecord.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
      },
    });
    if (!record) return notFound("Attendance record not found");
    return successResponse(record);
  } catch (error) {
    console.error("GET /attendance/records/:id error:", error);
    return internalError();
  }
});

/** PATCH /api/v1/hrms/attendance/records/:id — regularize or approve */
export const PATCH = withAuth(async (req: NextRequest, ctx, params) => {
  try {
    const { orgId, userId, permissions } = ctx;
    const existing = await prisma.attendanceRecord.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!existing) return notFound("Attendance record not found");

    const body = await req.json();

    // Regularization request by employee
    if (body.regularizationReason) {
      const parsed = regularizationSchema.safeParse(body);
      if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

      // Can't regularize a day that hasn't happened yet.
      const recordDay = new Date(existing.date); recordDay.setHours(0, 0, 0, 0);
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      if (recordDay > todayStart) {
        return validationError("You can't regularize a future date.");
      }
      // One open request at a time — don't silently overwrite an in-flight or
      // already-decided regularization. (Rejected days can be re-submitted.)
      if (existing.regularizationStatus === "Pending") {
        return conflict("A regularization for this day is already pending approval.");
      }
      if (existing.regularizationStatus === "Approved") {
        return conflict("This day's attendance has already been regularized.");
      }

      const record = await prisma.attendanceRecord.update({
        where: { id: params.id },
        data: {
          checkIn: parsed.data.checkIn ? new Date(parsed.data.checkIn) : existing.checkIn,
          checkOut: parsed.data.checkOut ? new Date(parsed.data.checkOut) : existing.checkOut,
          regularizationStatus: "Pending",
          regularizationReason: parsed.data.reason,
          updatedBy: userId,
        },
      });
      void fireWorkflow({
        orgId,
        event: "attendance.regularization.requested",
        payload: {
          employeeId: existing.employeeId,
          recordId: record.id,
          date: existing.date,
          reason: parsed.data.reason,
        },
      });
      return successResponse(record);
    }

    // Cancel — only the owning employee, only while still Pending
    if (body.action === "cancel") {
      const callerEmpId = await getCallerEmployeeId(ctx);
      if (!callerEmpId || callerEmpId !== existing.employeeId) {
        return forbidden("You can only cancel your own regularization request");
      }
      if (existing.regularizationStatus !== "Pending") {
        return validationError("Only a pending regularization can be cancelled");
      }
      const record = await prisma.attendanceRecord.update({
        where: { id: params.id },
        data: { regularizationStatus: "Cancelled", updatedBy: userId },
      });
      void fireWorkflow({
        orgId,
        event: "attendance.regularization.cancelled",
        payload: {
          employeeId: existing.employeeId,
          recordId: record.id,
          date: existing.date,
        },
      });
      return successResponse(record);
    }

    // Approval action — manager OR HR (perm-gated)
    if (body.status) {
      const parsed = regularizationActionSchema.safeParse(body);
      if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

      const isSuper = permissions.includes("*");
      const hasApprove = permissions.includes("hrms.attendance.approve");
      let allowed = isSuper || hasApprove;
      if (!allowed) {
        const callerEmpId = await getCallerEmployeeId(ctx);
        const reportees = callerEmpId ? await getCallerReporteeIds(ctx) : [];
        allowed = !!callerEmpId && reportees.includes(existing.employeeId);
      }
      if (!allowed) return forbidden("Not authorised to approve this regularization");

      // Don't re-decide a record that's already been actioned (stale list row /
      // double-click) — otherwise it silently flips an approved/rejected record.
      if (existing.regularizationStatus !== "Pending") {
        return conflict("This regularization is no longer pending — it may already have been actioned.");
      }

      const record = await prisma.attendanceRecord.update({
        where: { id: params.id },
        data: {
          regularizationStatus: parsed.data.status,
          updatedBy: userId,
        },
      });
      void fireWorkflow({
        orgId,
        event: parsed.data.status === "Approved" ? "attendance.regularization.approved" : "attendance.regularization.rejected",
        payload: {
          employeeId: existing.employeeId,
          recordId: record.id,
          actorId: userId,
          comment: parsed.data.comment,
        },
      });
      return successResponse(record);
    }

    return validationError("No valid action provided");
  } catch (error) {
    console.error("PATCH /attendance/records/:id error:", error);
    return internalError();
  }
});

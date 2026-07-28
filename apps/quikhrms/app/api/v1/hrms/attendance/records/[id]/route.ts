import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError, forbidden, conflict } from "@/lib/api-response";
import { regularizationSchema, regularizationActionSchema } from "@/lib/validations/attendance";
import { getCallerEmployeeId, getCallerReporteeIds } from "@/lib/rbac/scope";
import { fireWorkflow } from "@/lib/workflows/executor";
import { attendanceDayStart } from "@/lib/attendance/day";
import { regularizationBlockReason } from "@/lib/attendance/regularization-guards";

/** GET /api/v1/hrms/attendance/records/:id */
export const GET = withAuth(async (_req: NextRequest, ctx, params) => {
  try {
    const { orgId } = ctx;
    const record = await prisma.attendanceRecord.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
      },
    });
    if (!record) return notFound("Attendance record not found");

    // Scope gate: only a full-access reader, the employee themselves, or their
    // manager may view a record (blocks cross-employee IDOR).
    const canAll = ctx.permissions.includes("*") || ctx.permissions.includes("hrms.attendance.read");
    if (!canAll) {
      const callerEmpId = await getCallerEmployeeId(ctx);
      const reportees = callerEmpId ? await getCallerReporteeIds(ctx) : [];
      if (!callerEmpId || (callerEmpId !== record.employeeId && !reportees.includes(record.employeeId))) {
        return forbidden("You cannot view this attendance record.");
      }
    }
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

      // Ownership: you can only regularize your OWN attendance record.
      const requesterEmpId = await getCallerEmployeeId(ctx);
      if (!requesterEmpId || requesterEmpId !== existing.employeeId) {
        return forbidden("You can only regularize your own attendance record.");
      }

      // Duration cap — a single day can't span more than 24h.
      if (parsed.data.checkIn && parsed.data.checkOut) {
        const ci = new Date(parsed.data.checkIn).getTime();
        const co = new Date(parsed.data.checkOut).getTime();
        if (!(co > ci)) return validationError("Check-out must be after check-in.");
        if (co - ci > 24 * 60 * 60 * 1000) return validationError("A single day's regularization can't exceed 24 hours.");
      }

      // Can't regularize today (day not over yet) or a future date. Compare by
      // IST calendar date to match how attendance days are bucketed.
      const recordDay = attendanceDayStart(existing.date);
      const todayStart = attendanceDayStart();
      // Submitted punches must belong to the record's own IST attendance day —
      // a caller can't backfill a different day's times onto this record.
      if (parsed.data.checkIn && attendanceDayStart(new Date(parsed.data.checkIn)).getTime() !== recordDay.getTime()) {
        return validationError("Check-in must fall on the same day as this attendance record.");
      }
      if (parsed.data.checkOut && attendanceDayStart(new Date(parsed.data.checkOut)).getTime() !== recordDay.getTime()) {
        return validationError("Check-out must fall on the same day as this attendance record.");
      }
      if (recordDay >= todayStart) {
        return validationError("You can't regularize today or a future date — wait until the day is over.");
      }
      // Backdate window + finalized-payroll lock.
      const blockReason = await regularizationBlockReason(orgId, recordDay);
      if (blockReason) return conflict(blockReason);
      // Leave clash — a day covered by an approved/pending leave can't also be
      // regularized as attendance (one day can't be both worked and on leave).
      const leaveClash = await prisma.leaveRequest.findFirst({
        where: {
          orgId, employeeId: existing.employeeId, deletedAt: null,
          status: { in: ["Approved", "Pending"] },
          startDate: { lte: existing.date }, endDate: { gte: existing.date },
        },
        select: { leaveType: { select: { name: true } } },
      });
      if (leaveClash) {
        return conflict(`This day is on ${leaveClash.leaveType?.name ?? "leave"} — you can't regularize attendance for a leave day.`);
      }
      // One open request at a time — don't silently overwrite an in-flight or
      // already-decided regularization. (Rejected days can be re-submitted.)
      if (existing.regularizationStatus === "Pending") {
        return conflict("A regularization for this day is already pending approval.");
      }
      if (existing.regularizationStatus === "Approved") {
        return conflict("This day's attendance has already been regularized.");
      }

      // Store the REQUESTED times separately — do NOT touch the live
      // checkIn/checkOut until an approver approves. (Previously this overwrote
      // the real times on submit, so employees could self-edit attendance and a
      // rejection wouldn't undo it.)
      const record = await prisma.attendanceRecord.update({
        where: { id: params.id },
        data: {
          regularizedCheckIn: parsed.data.checkIn ? new Date(parsed.data.checkIn) : existing.checkIn,
          regularizedCheckOut: parsed.data.checkOut ? new Date(parsed.data.checkOut) : existing.checkOut,
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

      // Never approve/reject your OWN regularization, even with the approve
      // permission — closes the self-approval leg of the payroll-fraud chain.
      const approverEmpId = await getCallerEmployeeId(ctx);
      if (approverEmpId && approverEmpId === existing.employeeId) {
        return forbidden("You can't approve your own regularization request.");
      }

      const isSuper = permissions.includes("*");
      const hasApprove = permissions.includes("hrms.attendance.approve");
      let allowed = isSuper || hasApprove;
      if (!allowed) {
        const reportees = approverEmpId ? await getCallerReporteeIds(ctx) : [];
        allowed = !!approverEmpId && reportees.includes(existing.employeeId);
      }
      if (!allowed) return forbidden("Not authorised to approve this regularization");

      // Don't re-decide a record that's already been actioned (stale list row /
      // double-click) — otherwise it silently flips an approved/rejected record.
      if (existing.regularizationStatus !== "Pending") {
        return conflict("This regularization is no longer pending — it may already have been actioned.");
      }

      // On APPROVE, apply the requested times to the live record + recompute
      // hours. On REJECT, discard the request (live times stay untouched).
      const applyData: Record<string, unknown> = {
        regularizationStatus: parsed.data.status,
        regularizedCheckIn: null,
        regularizedCheckOut: null,
        updatedBy: userId,
      };
      if (parsed.data.status === "Approved") {
        const ci = existing.regularizedCheckIn ?? existing.checkIn;
        const co = existing.regularizedCheckOut ?? existing.checkOut;
        applyData.checkIn = ci;
        applyData.checkOut = co;
        if (co) applyData.missedCheckout = false; // day now has a checkout
        if (ci) applyData.status = "Present";
        if (ci && co) {
          const gross = Math.max(0, (co.getTime() - ci.getTime()) / 3_600_000);
          const brk = Number(existing.breakDuration ?? 0);
          applyData.grossHours = Math.round(gross * 100) / 100;
          applyData.effectiveHours = Math.round(Math.max(0, gross - brk) * 100) / 100;
        }
      }
      const record = await prisma.attendanceRecord.update({
        where: { id: params.id },
        data: applyData,
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

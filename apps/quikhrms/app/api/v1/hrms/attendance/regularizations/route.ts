import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError, forbidden, validationError, conflict } from "@/lib/api-response";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { resolveScope, employeeScopeFilter } from "@/lib/rbac/scope";
import { regularizationSchema } from "@/lib/validations/attendance";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { attendanceDayStart } from "@/lib/attendance/day";
import { regularizationBlockReason } from "@/lib/attendance/regularization-guards";
import { fireWorkflow } from "@/lib/workflows/executor";
import type { Prisma } from "@quikit/database";

/** GET /api/v1/hrms/attendance/regularizations — list pending/approval-scoped regularization requests */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { orgId } = ctx;
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const status = searchParams.get("status") ?? "Pending";

    const scope = resolveScope(ctx, {
      all: "hrms.attendance.approve",
      team: "hrms.attendance.read_team",
    });
    if (scope === "none") return forbidden("No regularization approval permission");

    const scopeFilter = await employeeScopeFilter(ctx, scope);
    if (!scopeFilter.allow) return forbidden();

    const where: Prisma.AttendanceRecordWhereInput = {
      orgId,
      deletedAt: null,
      regularizationStatus: status as Prisma.AttendanceRecordWhereInput["regularizationStatus"],
      ...(scopeFilter.employeeIds && { employeeId: { in: scopeFilter.employeeIds } }),
    };

    const [records, total] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where,
        orderBy: { date: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          employee: {
            select: { id: true, firstName: true, lastName: true, employeeCode: true, profilePhoto: true, jobTitle: true },
          },
        },
      }),
      prisma.attendanceRecord.count({ where }),
    ]);

    return successResponse(records, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /attendance/regularizations error:", error);
    return internalError();
  }
});

/**
 * POST /api/v1/hrms/attendance/regularizations — regularize a day that has NO
 * attendance record yet (e.g. fully Absent — the employee forgot to punch at
 * all). Creates the record with the requested times held as a Pending
 * regularization (real check-in/out stay empty until an approver approves).
 */
export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = regularizationSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    const { date, checkIn, checkOut, reason } = parsed.data;

    const employeeId = await resolveEmployeeId(orgId, userId);
    if (!employeeId) return validationError("Employee record not found");

    if (!checkIn && !checkOut) return validationError("Enter a corrected check-in and/or check-out time");

    // IST calendar day; only past days can be regularized.
    const day = attendanceDayStart(new Date(date));
    if (day >= attendanceDayStart()) {
      return validationError("You can't regularize today or a future date — wait until the day is over.");
    }

    // Backdate window + finalized-payroll lock.
    const blockReason = await regularizationBlockReason(orgId, day);
    if (blockReason) return conflict(blockReason);

    // This endpoint is only for days with NO record; if one exists, use the
    // record's own regularize action (PATCH) instead.
    const existing = await prisma.attendanceRecord.findFirst({
      where: { orgId, employeeId, date: day, deletedAt: null },
      select: { id: true },
    });
    if (existing) return conflict("An attendance record already exists for this day — regularize it from that row.");

    // Leave clash — can't record attendance on a day covered by approved/pending leave.
    const leave = await prisma.leaveRequest.findFirst({
      where: {
        orgId, employeeId, deletedAt: null,
        status: { in: ["Approved", "Pending"] },
        startDate: { lte: day }, endDate: { gte: day },
      },
      select: { leaveType: { select: { name: true } } },
    });
    if (leave) {
      return conflict(`This day is on ${leave.leaveType?.name ?? "leave"} — you can't regularize attendance for a leave day.`);
    }

    const record = await prisma.attendanceRecord.create({
      data: {
        orgId, employeeId, date: day,
        status: "Absent",
        regularizedCheckIn: checkIn ? new Date(checkIn) : null,
        regularizedCheckOut: checkOut ? new Date(checkOut) : null,
        regularizationStatus: "Pending",
        regularizationReason: reason,
        source: "Manual",
        createdBy: userId,
        updatedBy: userId,
      },
    });

    void fireWorkflow({
      orgId,
      event: "attendance.regularization.requested",
      payload: { employeeId, recordId: record.id, date: day, reason },
    });

    return successResponse(record, undefined, 201);
  } catch (error) {
    console.error("POST /attendance/regularizations error:", error);
    return internalError();
  }
});

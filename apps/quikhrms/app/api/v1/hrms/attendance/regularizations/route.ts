import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError, forbidden } from "@/lib/api-response";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { resolveScope, employeeScopeFilter } from "@/lib/rbac/scope";
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

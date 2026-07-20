import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withServiceAuth } from "@/lib/with-auth";
import { successResponse, internalError, forbidden } from "@/lib/api-response";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { resolveScope, employeeScopeFilter } from "@/lib/rbac/scope";
import { getHierarchyAccessibleEmployeeIds, intersectEmployeeIds } from "@/lib/rbac/hierarchy";
import type { Prisma } from "@quikit/database";

/** GET /api/v1/hrms/attendance/records — list attendance records */
export const GET = withServiceAuth(async (req: NextRequest, ctx) => {
  try {
    const { orgId } = ctx;
    const { searchParams } = new URL(req.url);
    const { page, limit, sort, order } = parsePagination(searchParams);

    const employeeId = searchParams.get("employeeId");
    const month = searchParams.get("month");
    const year = searchParams.get("year");
    const status = searchParams.get("status");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const departmentId = searchParams.get("departmentId");
    const search = searchParams.get("search");

    const scope = resolveScope(ctx, {
      all: "hrms.attendance.read",
      team: "hrms.attendance.read_team",
      self: "hrms.attendance.read_self",
    });
    const scopeFilter = await employeeScopeFilter(ctx, scope);
    if (!scopeFilter.allow) return forbidden("No attendance read permission");

    // Role-priority hierarchy: never expose employees above the caller's role.
    const hierarchy = await getHierarchyAccessibleEmployeeIds(ctx);
    const finalEmployeeIds = intersectEmployeeIds(scopeFilter.employeeIds, hierarchy);
    if (finalEmployeeIds && finalEmployeeIds.length === 0) {
      return successResponse([], paginationMeta(page, limit, 0));
    }
    if (employeeId && !hierarchy.unlimited && !(hierarchy.employeeIds ?? []).includes(employeeId)) {
      return forbidden("Cannot view attendance of an employee above your role hierarchy");
    }

    const employeeWhere: Prisma.EmployeeWhereInput = {
      ...(departmentId && { departmentId }),
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: "insensitive" } },
          { lastName: { contains: search, mode: "insensitive" } },
          { employeeCode: { contains: search, mode: "insensitive" } },
        ],
      }),
    };

    const where: Prisma.AttendanceRecordWhereInput = {
      orgId,
      deletedAt: null,
      ...(employeeId && { employeeId }),
      ...(status && { status: status as Prisma.AttendanceRecordWhereInput["status"] }),
      ...(finalEmployeeIds && { employeeId: { in: finalEmployeeIds } }),
      ...(Object.keys(employeeWhere).length > 0 && { employee: employeeWhere }),
    };

    if (month && year) {
      const m = parseInt(month, 10) - 1;
      const y = parseInt(year, 10);
      const start = new Date(y, m, 1);
      const end = new Date(y, m + 1, 0);
      where.date = { gte: start, lte: end };
    } else if (dateFrom || dateTo) {
      where.date = {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo && { lte: new Date(dateTo) }),
      };
    }

    const [records, total] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where,
        orderBy: sort ? { [sort]: order } : { date: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          employee: {
            select: {
              id: true, firstName: true, lastName: true, employeeCode: true, profilePhoto: true,
              department: { select: { id: true, name: true } },
            },
          },
        },
      }),
      prisma.attendanceRecord.count({ where }),
    ]);

    return successResponse(records, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /attendance/records error:", error);
    return internalError();
  }
});

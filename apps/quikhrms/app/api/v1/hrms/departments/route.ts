import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, conflict, internalError } from "@/lib/api-response";
import { createDepartmentSchema } from "@/lib/validations/organization";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { getHierarchyAccessibleEmployeeIds } from "@/lib/rbac/hierarchy";
import type { Prisma } from "@quikit/database";

const DEPT_INCLUDE = {
  head: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } },
  parentDepartment: { select: { id: true, name: true } },
  _count: { select: { employees: { where: { deletedAt: null } }, teams: { where: { deletedAt: null } } } },
} satisfies Prisma.DepartmentInclude;

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { orgId } = ctx;
    const { searchParams } = new URL(req.url);
    const { page, limit, sort, order } = parsePagination(searchParams);
    const search = searchParams.get("search");
    // Opt-in: only departments that have >=1 active employee within the caller's
    // role-priority hierarchy ("available" + access controlled).
    const accessible = searchParams.get("accessible") === "true";

    const baseWhere: Prisma.DepartmentWhereInput = {
      orgId,
      deletedAt: null,
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { code: { contains: search, mode: "insensitive" } },
        ],
      }),
    };
    const orderBy: Prisma.DepartmentOrderByWithRelationInput = sort ? { [sort]: order } : { name: "asc" };

    // Accessible mode is per-caller, so it bypasses the tenant-wide cache.
    if (accessible) {
      const hierarchy = await getHierarchyAccessibleEmployeeIds(ctx);
      const empWhere: Prisma.EmployeeWhereInput = {
        orgId,
        deletedAt: null,
        departmentId: { not: null },
        ...(!hierarchy.unlimited && { id: { in: hierarchy.employeeIds ?? [] } }),
      };
      const grouped = await prisma.employee.groupBy({ by: ["departmentId"], where: empWhere });
      const deptIds = grouped.map((g) => g.departmentId).filter((d): d is string => !!d);
      if (deptIds.length === 0) return successResponse([], paginationMeta(page, limit, 0));

      const where: Prisma.DepartmentWhereInput = { ...baseWhere, id: { in: deptIds } };
      const [departments, total] = await Promise.all([
        prisma.department.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit, include: DEPT_INCLUDE }),
        prisma.department.count({ where }),
      ]);
      return successResponse(departments, paginationMeta(page, limit, total));
    }

    const [data, total] = await Promise.all([
      prisma.department.findMany({ where: baseWhere, orderBy, skip: (page - 1) * limit, take: limit, include: DEPT_INCLUDE }),
      prisma.department.count({ where: baseWhere }),
    ]);

    return successResponse(data, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /departments error:", error);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createDepartmentSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const existing = await prisma.department.findFirst({
      where: { orgId, code: parsed.data.code, deletedAt: null },
    });
    if (existing) return conflict("Department code already exists");

    const department = await prisma.department.create({
      data: { orgId, ...parsed.data, createdBy: userId, updatedBy: userId },
      include: {
        head: { select: { id: true, firstName: true, lastName: true } },
        parentDepartment: { select: { id: true, name: true } },
      },
    });

    return successResponse(department, undefined, 201);
  } catch (error) {
    console.error("POST /departments error:", error);
    return internalError();
  }
});

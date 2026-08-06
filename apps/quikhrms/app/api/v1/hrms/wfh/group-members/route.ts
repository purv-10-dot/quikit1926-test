import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import type { Prisma } from "@quikit/database";

/**
 * GET /api/v1/hrms/wfh/group-members — active employees with the WFH quota group
 * they belong to. An employee's group is their direct `wfhQuotaGroupId`
 * assignment or, failing that, a Department-mode group whose `departmentIds`
 * include their department. Supports ?search= on name/email/code.
 */
export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const search = searchParams.get("search")?.trim();

    const groups = await prisma.wfhQuotaGroup.findMany({
      where: { orgId, deletedAt: null, isActive: true },
      select: { id: true, name: true, mode: true, departmentIds: true },
    });
    const groupNameById = new Map(groups.map((g) => [g.id, g.name]));
    const deptGroup = new Map<string, string>();
    for (const g of groups) {
      if (g.mode === "Department") {
        for (const d of g.departmentIds) if (!deptGroup.has(d)) deptGroup.set(d, g.name);
      }
    }

    const where: Prisma.EmployeeWhereInput = {
      orgId,
      deletedAt: null,
      status: "Active",
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: "insensitive" } },
          { lastName: { contains: search, mode: "insensitive" } },
          { workEmail: { contains: search, mode: "insensitive" } },
          { employeeCode: { contains: search, mode: "insensitive" } },
        ],
      }),
    };

    const [employees, total, org] = await Promise.all([
      prisma.employee.findMany({
        where,
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          workEmail: true,
          jobTitle: true,
          wfhQuotaGroupId: true,
          department: { select: { id: true, name: true } },
          designation: { select: { title: true } },
        },
      }),
      prisma.employee.count({ where }),
      prisma.org.findUnique({ where: { id: orgId }, select: { name: true } }),
    ]);

    const rows = employees.map((e) => {
      const direct = e.wfhQuotaGroupId ? groupNameById.get(e.wfhQuotaGroupId) : undefined;
      const viaDept = e.department?.id ? deptGroup.get(e.department.id) : undefined;
      return {
        id: e.id,
        employeeName: `${e.firstName} ${e.lastName ?? ""}`.trim(),
        organizationName: org?.name ?? "",
        department: e.department?.name ?? "",
        designation: e.designation?.title ?? e.jobTitle ?? "",
        workEmail: e.workEmail ?? "",
        wfhGroupName: direct ?? viaDept ?? "",
      };
    });

    return successResponse(rows, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /wfh/group-members error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.employee.read"], anyPermission: true });

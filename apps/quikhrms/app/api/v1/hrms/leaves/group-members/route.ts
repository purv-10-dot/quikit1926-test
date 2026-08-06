import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import type { Prisma } from "@quikit/database";

/**
 * GET /api/v1/hrms/leaves/group-members — active employees with the leave group
 * they belong to. An employee's group comes from a direct LeaveGroupAssignment
 * (assigneeType="Employee") or, failing that, a role-based assignment
 * (assigneeType="Role") on any role they hold. Supports ?search= on name/email/code.
 */
export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const search = searchParams.get("search")?.trim();

    // Resolve group names from active (non-deleted) leave groups.
    const assignments = await prisma.leaveGroupAssignment.findMany({
      where: { orgId, leaveGroup: { deletedAt: null, isActive: true } },
      select: { assigneeType: true, employeeId: true, roleId: true, leaveGroup: { select: { name: true } } },
    });
    const empGroup = new Map<string, string>();
    const roleGroup = new Map<string, string>();
    for (const a of assignments) {
      const g = a.leaveGroup?.name;
      if (!g) continue;
      if (a.assigneeType === "Employee" && a.employeeId) empGroup.set(a.employeeId, g);
      else if (a.assigneeType === "Role" && a.roleId) roleGroup.set(a.roleId, g);
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
          dateOfJoining: true,
          previousExperience: true,
          department: { select: { name: true } },
          designation: { select: { title: true } },
          appRoles: { select: { roleId: true } },
        },
      }),
      prisma.employee.count({ where }),
      prisma.org.findUnique({ where: { id: orgId }, select: { name: true } }),
    ]);

    const now = new Date();
    const expMonths = (doj: Date | null, prev: number | null | undefined) => {
      let m = prev ?? 0;
      if (doj) m += Math.max(0, (now.getFullYear() - doj.getFullYear()) * 12 + (now.getMonth() - doj.getMonth()));
      return m;
    };

    const rows = employees.map((e) => {
      const direct = empGroup.get(e.id);
      const viaRole = e.appRoles.map((r) => roleGroup.get(r.roleId)).find(Boolean);
      return {
        id: e.id,
        employeeName: `${e.firstName} ${e.lastName ?? ""}`.trim(),
        organizationName: org?.name ?? "",
        department: e.department?.name ?? "",
        designation: e.designation?.title ?? e.jobTitle ?? "",
        workEmail: e.workEmail ?? "",
        experienceMonths: expMonths(e.dateOfJoining, e.previousExperience),
        leaveGroupName: direct ?? viaRole ?? "",
      };
    });

    return successResponse(rows, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /leaves/group-members error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.leave.manage"] });

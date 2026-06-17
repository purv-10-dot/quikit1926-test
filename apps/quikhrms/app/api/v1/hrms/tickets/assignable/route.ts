import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import type { Prisma } from "@quikit/database";

/**
 * GET /api/v1/hrms/tickets/assignable?departmentId=...&search=...
 *
 * Lists active employees in a department who can be assigned a ticket. Unlike
 * /employees, this is NOT gated by the caller's employee-read scope — anyone who
 * can raise a ticket must be able to route it to the right person in the chosen
 * department. Exposure is limited to that department's members + minimal fields.
 */
export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const departmentId = searchParams.get("departmentId") ?? searchParams.get("department");
    const search = searchParams.get("search");
    const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100);

    if (!departmentId) return validationError("departmentId is required");

    const where: Prisma.EmployeeWhereInput = {
      orgId,
      deletedAt: null,
      status: "Active",
      departmentId,
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: "insensitive" } },
          { lastName: { contains: search, mode: "insensitive" } },
          { workEmail: { contains: search, mode: "insensitive" } },
          { employeeCode: { contains: search, mode: "insensitive" } },
          { jobTitle: { contains: search, mode: "insensitive" } },
        ],
      }),
    };

    const employees = await prisma.employee.findMany({
      where,
      orderBy: { firstName: "asc" },
      take: limit,
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        workEmail: true,
        jobTitle: true,
        profilePhoto: true,
        designation: { select: { title: true } },
        department: { select: { name: true } },
      },
    });

    return successResponse(employees);
  } catch (error) {
    console.error("GET /tickets/assignable error:", error);
    return internalError();
  }
}, {
  requiredPermissions: ["hrms.ticket.raise", "hrms.ticket.read", "hrms.ticket.read_self", "hrms.ticket.write"],
  anyPermission: true,
});

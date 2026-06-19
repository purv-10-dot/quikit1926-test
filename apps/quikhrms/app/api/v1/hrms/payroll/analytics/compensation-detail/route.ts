import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";

export const GET = withAuth(async (_req: NextRequest, { orgId }) => {
  try {
    // EmployeeSalary has no `employee` relation in schema — fetch separately + join in memory.
    const salaries = await prisma.employeeSalary.findMany({
      where: { orgId, deletedAt: null, isActive: true },
      select: { id: true, employeeId: true, ctc: true, effectiveFrom: true },
    });
    if (salaries.length === 0) return successResponse([]);

    const employeeIds = [...new Set(salaries.map((s) => s.employeeId))];
    const employees = await prisma.employee.findMany({
      where: { id: { in: employeeIds }, orgId, deletedAt: null },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        dateOfJoining: true,
        department: { select: { id: true, name: true } },
        designation: { select: { id: true, title: true } },
        grade: { select: { id: true, name: true } },
        officeLocation: { select: { id: true, name: true, city: true, state: true } },
      },
    });
    const employeeById = new Map(employees.map((e) => [e.id, e]));

    const rows = salaries
      .map((s) => {
        const e = employeeById.get(s.employeeId);
        if (!e) return null;
        const loc = e.officeLocation;
        const locName = loc ? loc.name || [loc.city, loc.state].filter(Boolean).join(", ") || "—" : "—";
        return {
          salaryId: s.id,
          employeeId: e.id,
          code: e.employeeCode,
          name: `${e.firstName} ${e.lastName}`.trim(),
          ctc: Number(s.ctc),
          effectiveFrom: s.effectiveFrom.toISOString(),
          dateOfJoining: e.dateOfJoining ? e.dateOfJoining.toISOString() : null,
          deptId: e.department?.id ?? null,
          deptName: e.department?.name ?? "Unassigned",
          designationId: e.designation?.id ?? null,
          designationName: e.designation?.title ?? "Unassigned",
          gradeId: e.grade?.id ?? null,
          gradeName: e.grade?.name ?? null,
          locationId: loc?.id ?? null,
          locationName: locName,
          city: loc?.city ?? null,
          state: loc?.state ?? null,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    return successResponse(rows);
  } catch (e) {
    console.error("GET /payroll/analytics/compensation-detail error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.read", "hrms.settings.write"] });

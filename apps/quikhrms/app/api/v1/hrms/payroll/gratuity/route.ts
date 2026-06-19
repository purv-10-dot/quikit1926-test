import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { computeGratuity } from "@/lib/services/payroll-settlement";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const url = new URL(req.url);
    const employeeId = url.searchParams.get("employeeId");
    const lwd = url.searchParams.get("lastWorkingDate");
    if (!employeeId) {
      // List historical records
      const list = await prisma.gratuityRecord.findMany({
        where: { orgId, deletedAt: null },
        orderBy: { computeDate: "desc" },
      });
      const empIds = [...new Set(list.map((r) => r.employeeId))];
      const employees = empIds.length
        ? await prisma.employee.findMany({
            where: { orgId, deletedAt: null, id: { in: empIds } },
            select: { id: true, firstName: true, lastName: true, employeeCode: true },
          })
        : [];
      const map = new Map(employees.map((e) => [e.id, e]));
      return successResponse(list.map((r) => ({ ...r, employee: map.get(r.employeeId) ?? null })));
    }

    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, orgId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, employeeCode: true, dateOfJoining: true },
    });
    if (!employee) return validationError("Employee not found");

    // Pick latest active salary basic+DA
    const today = new Date();
    const sal = await prisma.employeeSalary.findFirst({
      where: { orgId, employeeId, isActive: true, deletedAt: null },
      include: { structure: { include: { components: { include: { component: true } } } } },
      orderBy: { effectiveFrom: "desc" },
    });
    let basicMonthly = 0;
    let daMonthly = 0;
    if (sal?.structure) {
      const monthlyCTC = Number(sal.ctc) / 12;
      for (const sc of sal.structure.components) {
        const value = Number(sc.amountValue ?? 0);
        let amt = 0;
        if (sc.amountType === "Fixed") amt = value;
        else if (sc.amountType === "PercentOfCTC") amt = (monthlyCTC * value) / 100;
        if (sc.component.category === "Basic") basicMonthly = amt;
        if (sc.component.category === "DA") daMonthly = amt;
      }
    }

    const lastWorkingDate = lwd ? new Date(lwd) : today;
    const result = computeGratuity({
      monthlyBasicDA: basicMonthly + daMonthly,
      dateOfJoining: employee.dateOfJoining,
      lastWorkingDate,
    });

    return successResponse({
      employee,
      basicMonthly,
      daMonthly,
      lastWorkingDate,
      ...result,
    });
  } catch (e) {
    console.error("GET /payroll/gratuity error:", e);
    return internalError();
  }
});

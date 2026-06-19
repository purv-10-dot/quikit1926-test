import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError, validationError, notFound } from "@/lib/api-response";
import {
  applyDeductionCaps,
  computeAnnualTax,
  getEmployeeDeductions,
  type Regime,
} from "@/lib/services/payroll-tds";

function fyBounds(fy: string): { start: Date; end: Date } {
  const [startYearStr] = fy.split("-");
  const startYear = Number(startYearStr);
  return { start: new Date(`${startYear}-04-01`), end: new Date(`${startYear + 1}-03-31`) };
}

function assessmentYear(fy: string): string {
  const [startYearStr] = fy.split("-");
  const startYear = Number(startYearStr);
  return `${startYear + 1}-${String((startYear + 2) % 100).padStart(2, "0")}`;
}

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const url = new URL(req.url);
    const fy = url.searchParams.get("fy");
    const employeeId = url.searchParams.get("employeeId");
    if (!fy) return validationError("fy parameter required (e.g. fy=2026-27)");

    const { start, end } = fyBounds(fy);

    // --- Detailed Part B for a single employee ---
    if (employeeId) {
      const [employee, company, claimsSettings, payslips] = await Promise.all([
        prisma.employee.findFirst({
          where: { id: employeeId, orgId, deletedAt: null },
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            panNumber: true,
            workEmail: true,
            dateOfJoining: true,
            department: { select: { name: true } },
            designation: { select: { title: true } },
          },
        }),
        prisma.companySettings.findUnique({
          where: { orgId },
          select: { companyName: true, pan: true, addressLine1: true, city: true, state: true },
        }),
        prisma.claimsDeclarationSettings.findUnique({
          where: { orgId },
          select: { defaultRegime: true },
        }),
        prisma.payslip.findMany({
          where: {
            orgId,
            deletedAt: null,
            employeeId,
            status: "Released",
            periodStart: { gte: start },
            periodEnd: { lte: end },
          },
          include: { lines: true },
          orderBy: { periodStart: "asc" },
        }),
      ]);

      if (!employee) return notFound("Employee not found");
      if (payslips.length === 0) {
        return validationError("No released payslips found for this employee in the selected FY");
      }

      const regime: Regime = claimsSettings?.defaultRegime ?? "NewRegime";

      let grossSalary = 0;
      let professionalTax = 0;
      let tdsDeducted = 0;
      const monthly: { month: string; grossPaid: number; tdsDeducted: number }[] = [];

      for (const p of payslips) {
        const gross = Number(p.grossEarnings);
        grossSalary += gross;
        let monthlyTds = 0;
        for (const l of p.lines) {
          const amt = Number(l.amount);
          if (l.category === "ProfessionalTax") professionalTax += amt;
          else if (l.category === "IncomeTax") {
            tdsDeducted += amt;
            monthlyTds += amt;
          }
        }
        monthly.push({
          month: new Date(p.periodStart).toLocaleString("en-IN", { month: "long", year: "numeric" }),
          grossPaid: gross,
          tdsDeducted: monthlyTds,
        });
      }

      const rawDeductions = await getEmployeeDeductions(orgId, employeeId, fy);
      const caps = applyDeductionCaps(rawDeductions);
      const breakup = computeAnnualTax({
        annualGrossSalary: grossSalary,
        regime,
        deductions: rawDeductions,
      });

      const partB = {
        employer: {
          name: company?.companyName ?? null,
          pan: company?.pan ?? null,
          address: [company?.addressLine1, company?.city, company?.state].filter(Boolean).join(", ") || null,
        },
        employee: {
          id: employee.id,
          employeeCode: employee.employeeCode,
          name: `${employee.firstName} ${employee.lastName}`,
          pan: employee.panNumber,
          department: employee.department?.name ?? null,
          designation: employee.designation?.title ?? null,
          dateOfJoining: employee.dateOfJoining,
        },
        financialYear: fy,
        assessmentYear: assessmentYear(fy),
        regime,
        salary: {
          grossSalary,
          standardDeduction: breakup.standardDeduction,
          exemptAllowances: breakup.exemptAllowances,
          professionalTax,
          netSalary: breakup.netSalary,
        },
        chapterVIA: regime === "OldRegime"
          ? {
              section80C: caps.section80C,
              section80D: caps.section80D,
              section80E: caps.section80E,
              section80G: caps.section80G,
              section80TTA: caps.section80TTA,
              nps80CCD1B: caps.nps80CCD1B,
              homeLoanInterest: caps.homeLoanInterest,
              total: breakup.chapterVIATotal,
            }
          : null,
        tax: {
          taxableIncome: breakup.taxableIncome,
          baseTax: breakup.baseTax,
          rebate87A: breakup.rebate87A,
          taxAfterRebate: breakup.taxAfterRebate,
          surcharge: breakup.surcharge,
          educationCess: breakup.educationCess,
          totalTaxLiability: breakup.totalTaxLiability,
        },
        tds: {
          totalDeducted: tdsDeducted,
          balanceDue: Math.max(0, breakup.totalTaxLiability - tdsDeducted),
          refundDue: Math.max(0, tdsDeducted - breakup.totalTaxLiability),
          monthly,
        },
      };

      return successResponse(partB);
    }

    // --- Summary list across all employees ---
    const payslips = await prisma.payslip.findMany({
      where: {
        orgId,
        deletedAt: null,
        status: "Released",
        periodStart: { gte: start },
        periodEnd: { lte: end },
      },
      include: { lines: true },
    });

    const employees = await prisma.employee.findMany({
      where: { orgId, deletedAt: null },
      select: {
        id: true, employeeCode: true, firstName: true, lastName: true,
        panNumber: true, workEmail: true,
        department: { select: { name: true } }, designation: { select: { title: true } },
      },
    });
    const empMap = new Map(employees.map((e) => [e.id, e]));

    const aggByEmp = new Map<string, {
      employee: typeof employees[number];
      grossEarnings: number;
      totalDeductions: number;
      netPay: number;
      epfEmployee: number;
      esiEmployee: number;
      professionalTax: number;
      incomeTax: number;
      months: number;
    }>();

    for (const p of payslips) {
      const emp = empMap.get(p.employeeId);
      if (!emp) continue;
      const curr = aggByEmp.get(p.employeeId) ?? {
        employee: emp, grossEarnings: 0, totalDeductions: 0, netPay: 0,
        epfEmployee: 0, esiEmployee: 0, professionalTax: 0, incomeTax: 0, months: 0,
      };
      curr.grossEarnings += Number(p.grossEarnings);
      curr.totalDeductions += Number(p.totalDeductions);
      curr.netPay += Number(p.netPay);
      curr.months += 1;
      for (const l of p.lines) {
        const amt = Number(l.amount);
        if (l.category === "EPFEmployee") curr.epfEmployee += amt;
        else if (l.category === "ESIEmployee") curr.esiEmployee += amt;
        else if (l.category === "ProfessionalTax") curr.professionalTax += amt;
        else if (l.category === "IncomeTax") curr.incomeTax += amt;
      }
      aggByEmp.set(p.employeeId, curr);
    }

    const summaries = Array.from(aggByEmp.values()).map((r) => ({
      employeeId: r.employee.id,
      employee: {
        employeeCode: r.employee.employeeCode,
        name: `${r.employee.firstName} ${r.employee.lastName}`,
        pan: r.employee.panNumber,
        department: r.employee.department?.name ?? null,
        designation: r.employee.designation?.title ?? null,
      },
      grossEarnings: r.grossEarnings,
      totalDeductions: r.totalDeductions,
      netPay: r.netPay,
      epfEmployee: r.epfEmployee,
      esiEmployee: r.esiEmployee,
      professionalTax: r.professionalTax,
      tdsDeducted: r.incomeTax,
      monthsProcessed: r.months,
    }));

    return successResponse({ financialYear: fy, employeeCount: summaries.length, summaries });
  } catch (e) {
    console.error("GET /payroll/form16 error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.read", "hrms.settings.write"] });

import { prisma } from "@/lib/prisma";
import type { ReportDefinition } from "../types";
import { fmtDate, fullName, num } from "../format";
import { getScopedPayslips, lineByCode, sumByCategory, type ScopedLine } from "../payroll-data";

function totalsRow(rows: Record<string, unknown>[], labelKey: string, numericKeys: string[]): Record<string, unknown> {
  const t: Record<string, unknown> = { [labelKey]: "TOTAL" };
  for (const k of numericKeys) t[k] = rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
  return t;
}

export const statutoryReports: ReportDefinition[] = [
  {
    key: "pf-ecr",
    label: "PF / EPF ECR",
    description: "EPF wages and employee/employer contributions for the EPFO ECR upload.",
    category: "Statutory",
    usesDateRange: true,
    async run(ctx) {
      const { payslips, empMap } = await getScopedPayslips(ctx);
      const rows = payslips.map((p) => {
        const e = empMap.get(p.employeeId);
        const lines = p.lines as ScopedLine[];
        return {
          uan: e?.uanNumber ?? "",
          code: e?.employeeCode ?? "",
          name: fullName(e),
          gross: num(p.grossEarnings),
          epfWages: Math.round(sumByCategory(lines, "Basic") + sumByCategory(lines, "DA")),
          epfEmployee: lineByCode(lines, "EPF_EMP"),
          epfEmployer: lineByCode(lines, "EPF_ER"),
          edli: lineByCode(lines, "EDLI_ER"),
          admin: lineByCode(lines, "EPF_ADMIN"),
        };
      }).filter((r) => r.epfEmployee || r.epfEmployer);
      if (rows.length) rows.push(totalsRow(rows, "uan", ["gross", "epfWages", "epfEmployee", "epfEmployer", "edli", "admin"]) as typeof rows[number]);
      return {
        title: "PF / EPF ECR",
        columns: [
          { key: "uan", label: "UAN", width: 16 },
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 22 },
          { key: "gross", label: "Gross Wages", width: 14, money: true },
          { key: "epfWages", label: "EPF Wages", width: 14, money: true },
          { key: "epfEmployee", label: "EPF (Employee)", width: 14, money: true },
          { key: "epfEmployer", label: "EPF (Employer)", width: 14, money: true },
          { key: "edli", label: "EDLI", width: 12, money: true },
          { key: "admin", label: "Admin Charges", width: 14, money: true },
        ],
        rows,
      };
    },
  },
  {
    key: "esi-contribution",
    label: "ESI Contribution",
    description: "ESI gross and employee/employer contributions for the ESIC return.",
    category: "Statutory",
    usesDateRange: true,
    async run(ctx) {
      const { payslips, empMap } = await getScopedPayslips(ctx);
      const rows = payslips.map((p) => {
        const e = empMap.get(p.employeeId);
        const lines = p.lines as ScopedLine[];
        return {
          esiNo: e?.esiNumber ?? "",
          code: e?.employeeCode ?? "",
          name: fullName(e),
          gross: num(p.grossEarnings),
          esiEmployee: lineByCode(lines, "ESI_EMP"),
          esiEmployer: lineByCode(lines, "ESI_ER"),
        };
      }).filter((r) => r.esiEmployee || r.esiEmployer);
      if (rows.length) rows.push(totalsRow(rows, "esiNo", ["gross", "esiEmployee", "esiEmployer"]) as typeof rows[number]);
      return {
        title: "ESI Contribution",
        columns: [
          { key: "esiNo", label: "ESI No.", width: 16 },
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 24 },
          { key: "gross", label: "Gross Wages", width: 14, money: true },
          { key: "esiEmployee", label: "ESI (Employee)", width: 14, money: true },
          { key: "esiEmployer", label: "ESI (Employer)", width: 14, money: true },
        ],
        rows,
      };
    },
  },
  {
    key: "professional-tax",
    label: "Professional Tax (PT)",
    description: "Professional Tax deducted per employee for the scoped period.",
    category: "Statutory",
    usesDateRange: true,
    async run(ctx) {
      const { payslips, empMap } = await getScopedPayslips(ctx);
      const rows = payslips.map((p) => {
        const e = empMap.get(p.employeeId);
        return { code: e?.employeeCode ?? "", name: fullName(e), department: e?.department?.name ?? "", pt: sumByCategory(p.lines as ScopedLine[], "ProfessionalTax") };
      }).filter((r) => r.pt > 0);
      if (rows.length) rows.push(totalsRow(rows, "code", ["pt"]) as typeof rows[number]);
      return {
        title: "Professional Tax (PT)",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 24 },
          { key: "department", label: "Department", width: 18 },
          { key: "pt", label: "Professional Tax", width: 16, money: true },
        ],
        rows,
      };
    },
  },
  {
    key: "lwf",
    label: "Labour Welfare Fund (LWF)",
    description: "LWF employee and employer contributions for the scoped period.",
    category: "Statutory",
    usesDateRange: true,
    async run(ctx) {
      const { payslips, empMap } = await getScopedPayslips(ctx);
      const rows = payslips.map((p) => {
        const e = empMap.get(p.employeeId);
        const lines = p.lines as ScopedLine[];
        return { code: e?.employeeCode ?? "", name: fullName(e), lwfEmployee: sumByCategory(lines, "LWFEmployee"), lwfEmployer: sumByCategory(lines, "LWFEmployer") };
      }).filter((r) => r.lwfEmployee || r.lwfEmployer);
      if (rows.length) rows.push(totalsRow(rows, "code", ["lwfEmployee", "lwfEmployer"]) as typeof rows[number]);
      return {
        title: "Labour Welfare Fund (LWF)",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 24 },
          { key: "lwfEmployee", label: "LWF (Employee)", width: 16, money: true },
          { key: "lwfEmployer", label: "LWF (Employer)", width: 16, money: true },
        ],
        rows,
      };
    },
  },
  {
    key: "statutory-bonus",
    label: "Statutory Bonus",
    description: "Bonus provision per employee (Payment of Bonus Act) for the scoped period.",
    category: "Statutory",
    usesDateRange: true,
    async run(ctx) {
      const { payslips, empMap } = await getScopedPayslips(ctx);
      const rows = payslips.map((p) => {
        const e = empMap.get(p.employeeId);
        const lines = p.lines as ScopedLine[];
        return { code: e?.employeeCode ?? "", name: fullName(e), basic: sumByCategory(lines, "Basic"), bonus: sumByCategory(lines, "Bonus") };
      }).filter((r) => r.bonus > 0);
      if (rows.length) rows.push(totalsRow(rows, "code", ["basic", "bonus"]) as typeof rows[number]);
      return {
        title: "Statutory Bonus",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 24 },
          { key: "basic", label: "Basic", width: 14, money: true },
          { key: "bonus", label: "Bonus Provision", width: 16, money: true },
        ],
        rows,
      };
    },
  },
  {
    key: "gratuity-liability",
    label: "Gratuity Liability",
    description: "Computed gratuity records: years of service, amount, tax exemption and payment status.",
    category: "Statutory",
    async run({ orgId }) {
      const recs = await prisma.gratuityRecord.findMany({ where: { orgId, deletedAt: null }, orderBy: { computeDate: "desc" } });
      const empIds = [...new Set(recs.map((r) => r.employeeId))];
      const emps = empIds.length ? await prisma.employee.findMany({ where: { orgId, id: { in: empIds } }, select: { id: true, employeeCode: true, firstName: true, lastName: true } }) : [];
      const empMap = new Map(emps.map((e) => [e.id, e]));
      return {
        title: "Gratuity Liability",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 22 },
          { key: "computeDate", label: "Computed On", width: 14 },
          { key: "yearsOfService", label: "Years of Service", width: 14 },
          { key: "computedAmount", label: "Gratuity", width: 14, money: true },
          { key: "taxExempt", label: "Tax Exempt", width: 14, money: true },
          { key: "taxable", label: "Taxable", width: 12, money: true },
          { key: "paid", label: "Paid", width: 8 },
          { key: "paidOn", label: "Paid On", width: 14 },
        ],
        rows: recs.map((r) => {
          const e = empMap.get(r.employeeId);
          return {
            code: e?.employeeCode ?? "",
            name: fullName(e),
            computeDate: fmtDate(r.computeDate),
            yearsOfService: num(r.yearsOfService),
            computedAmount: num(r.computedAmount),
            taxExempt: num(r.taxExemptAmount),
            taxable: num(r.taxableAmount),
            paid: r.paid ? "Yes" : "No",
            paidOn: fmtDate(r.paidOn),
          };
        }),
      };
    },
  },
  {
    key: "minimum-wage-compliance",
    label: "Minimum Wage Compliance",
    description: "Active employees' monthly salary vs the lowest configured state minimum wage (approximate).",
    category: "Statutory",
    async run({ orgId }) {
      const today = new Date();
      const [sals, minWages] = await Promise.all([
        prisma.employeeSalary.findMany({
          where: { orgId, isActive: true, deletedAt: null, effectiveFrom: { lte: today }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }] },
          select: { employeeId: true, ctc: true },
        }),
        prisma.stateMinimumWage.findMany({ where: { orgId }, orderBy: { monthlyWage: "asc" } }),
      ]);
      const reference = minWages.length ? num(minWages[0].monthlyWage) : 0;
      const emps = sals.length ? await prisma.employee.findMany({ where: { orgId, id: { in: sals.map((s) => s.employeeId) } }, select: { id: true, employeeCode: true, firstName: true, lastName: true, department: { select: { name: true } } } }) : [];
      const empMap = new Map(emps.map((e) => [e.id, e]));
      return {
        title: "Minimum Wage Compliance",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 22 },
          { key: "department", label: "Department", width: 18 },
          { key: "monthlySalary", label: "Monthly Salary", width: 16, money: true },
          { key: "minWage", label: "Min Wage Ref", width: 14, money: true },
          { key: "status", label: "Status", width: 12 },
        ],
        rows: sals.map((s) => {
          const e = empMap.get(s.employeeId);
          const monthly = Math.round(num(s.ctc) / 12);
          return {
            code: e?.employeeCode ?? "",
            name: fullName(e),
            department: e?.department?.name ?? "",
            monthlySalary: monthly,
            minWage: reference,
            status: reference === 0 ? "No reference" : monthly >= reference ? "Compliant" : "Below",
          };
        }),
      };
    },
  },
];

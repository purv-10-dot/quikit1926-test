import { prisma } from "@/lib/prisma";
import type { ReportDefinition } from "../types";
import { fmtDate, fullName, num, dateRange } from "../format";
import { getScopedPayslips, lineByCode, sumByCategory, type ScopedLine } from "../payroll-data";

// Compute each structure component's monthly amount (mirrors payroll-compute /
// leave-encashment: Fixed, %CTC, %Basic; Formula falls back to 0).
function componentMonthly(
  components: { amountType: string; amountValue: unknown; component: { name: string; category: string } }[],
  monthlyCTC: number,
) {
  let basic = 0;
  for (const sc of components) {
    if (sc.component.category !== "Basic") continue;
    basic = sc.amountType === "Fixed" ? num(sc.amountValue) : sc.amountType === "PercentOfCTC" ? (monthlyCTC * num(sc.amountValue)) / 100 : basic;
  }
  return components.map((sc) => {
    const v = num(sc.amountValue);
    let amt = 0;
    if (sc.amountType === "Fixed") amt = v;
    else if (sc.amountType === "PercentOfCTC") amt = (monthlyCTC * v) / 100;
    else if (sc.amountType === "PercentOfBasic") amt = (basic * v) / 100;
    return { name: sc.component.name, category: sc.component.category, monthly: Math.round(amt) };
  });
}

async function activeSalaries(orgId: string) {
  const today = new Date();
  return prisma.employeeSalary.findMany({
    where: {
      orgId, isActive: true, deletedAt: null,
      effectiveFrom: { lte: today },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
    },
    include: {
      structure: { include: { components: { include: { component: true } } } },
    },
  });
}

export const payrollReports: ReportDefinition[] = [
  {
    key: "payroll-register",
    label: "Payroll Register",
    description: "Master salary register: working/paid/LOP days, gross, deductions and net per employee.",
    category: "Payroll",
    usesDateRange: true,
    async run(ctx) {
      const { payslips, empMap } = await getScopedPayslips(ctx);
      const rows = payslips.map((p) => {
        const e = empMap.get(p.employeeId);
        return {
          code: e?.employeeCode ?? "",
          name: fullName(e),
          department: e?.department?.name ?? "",
          period: `${fmtDate(p.periodStart)} → ${fmtDate(p.periodEnd)}`,
          workingDays: num(p.workingDays),
          paidDays: num(p.paidDays),
          lopDays: num(p.lopDays),
          gross: num(p.grossEarnings),
          deductions: num(p.totalDeductions),
          net: num(p.netPay),
          status: String(p.status),
        };
      });
      if (rows.length) {
        rows.push({
          code: "TOTAL", name: `${rows.length} employees`, department: "", period: "",
          workingDays: 0, paidDays: 0, lopDays: 0,
          gross: rows.reduce((s, r) => s + (r.gross as number), 0),
          deductions: rows.reduce((s, r) => s + (r.deductions as number), 0),
          net: rows.reduce((s, r) => s + (r.net as number), 0),
          status: "",
        });
      }
      return {
        title: "Payroll Register",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 22 },
          { key: "department", label: "Department", width: 16 },
          { key: "period", label: "Period", width: 22 },
          { key: "workingDays", label: "Working Days", width: 12 },
          { key: "paidDays", label: "Paid Days", width: 10 },
          { key: "lopDays", label: "LOP Days", width: 10 },
          { key: "gross", label: "Gross", width: 14, money: true },
          { key: "deductions", label: "Deductions", width: 14, money: true },
          { key: "net", label: "Net Pay", width: 14, money: true },
          { key: "status", label: "Status", width: 10 },
        ],
        rows,
      };
    },
  },
  {
    key: "ctc-breakup",
    label: "CTC Breakup",
    description: "Component-wise monthly and annual CTC for each employee's active salary.",
    category: "Payroll",
    async run({ orgId }) {
      const sals = await activeSalaries(orgId);
      const empIds = sals.map((s) => s.employeeId);
      const emps = empIds.length ? await prisma.employee.findMany({
        where: { orgId, id: { in: empIds } },
        select: { id: true, employeeCode: true, firstName: true, lastName: true, department: { select: { name: true } } },
      }) : [];
      const empMap = new Map(emps.map((e) => [e.id, e]));
      const rows: Record<string, unknown>[] = [];
      for (const s of sals) {
        const e = empMap.get(s.employeeId);
        const monthlyCTC = num(s.ctc) / 12;
        const comps = componentMonthly(s.structure?.components ?? [], monthlyCTC);
        for (const c of comps) {
          rows.push({
            code: e?.employeeCode ?? "",
            name: fullName(e),
            department: e?.department?.name ?? "",
            component: c.name,
            category: c.category,
            monthly: c.monthly,
            annual: c.monthly * 12,
          });
        }
      }
      return {
        title: "CTC Breakup",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 22 },
          { key: "department", label: "Department", width: 16 },
          { key: "component", label: "Component", width: 22 },
          { key: "category", label: "Category", width: 16 },
          { key: "monthly", label: "Monthly", width: 14, money: true },
          { key: "annual", label: "Annual", width: 14, money: true },
        ],
        rows,
      };
    },
  },
  {
    key: "salary-component-summary",
    label: "Salary Component Summary",
    description: "Org-wide total per pay component (earnings & deductions) for the scoped period.",
    category: "Payroll",
    usesDateRange: true,
    async run(ctx) {
      const { payslips } = await getScopedPayslips(ctx);
      const map = new Map<string, { name: string; type: string; category: string; total: number; count: number }>();
      for (const p of payslips) {
        for (const l of p.lines as ScopedLine[]) {
          const row = map.get(l.componentCode) ?? { name: l.componentName, type: l.type, category: l.category, total: 0, count: 0 };
          row.total += Number(l.amount);
          row.count++;
          map.set(l.componentCode, row);
        }
      }
      return {
        title: "Salary Component Summary",
        columns: [
          { key: "component", label: "Component", width: 24 },
          { key: "type", label: "Type", width: 16 },
          { key: "category", label: "Category", width: 18 },
          { key: "employees", label: "Employees", width: 12 },
          { key: "total", label: "Total Amount", width: 16, money: true },
        ],
        rows: [...map.values()]
          .sort((a, b) => b.total - a.total)
          .map((v) => ({ component: v.name, type: v.type, category: v.category, employees: v.count, total: Math.round(v.total) })),
      };
    },
  },
  {
    key: "bank-neft-advice",
    label: "Bank Transfer / NEFT Advice",
    description: "Net pay with bank account and IFSC for salary disbursement upload.",
    category: "Payroll",
    usesDateRange: true,
    async run(ctx) {
      const { payslips, empMap } = await getScopedPayslips(ctx);
      const rows = payslips.map((p) => {
        const e = empMap.get(p.employeeId);
        const arr = Array.isArray(e?.bankAccounts) ? (e!.bankAccounts as Record<string, unknown>[]) : [];
        const b = (arr[0] ?? {}) as Record<string, unknown>;
        return {
          code: e?.employeeCode ?? "",
          name: fullName(e),
          bank: String(b.bankName ?? b.bank ?? ""),
          account: String(b.accountNumber ?? b.accountNo ?? ""),
          ifsc: String(b.ifsc ?? b.ifscCode ?? ""),
          net: num(p.netPay),
        };
      });
      if (rows.length) rows.push({ code: "TOTAL", name: `${rows.length} employees`, bank: "", account: "", ifsc: "", net: rows.reduce((s, r) => s + (r.net as number), 0) });
      return {
        title: "Bank Transfer / NEFT Advice",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 24 },
          { key: "bank", label: "Bank", width: 20 },
          { key: "account", label: "Account No.", width: 20 },
          { key: "ifsc", label: "IFSC", width: 14 },
          { key: "net", label: "Net Pay", width: 16, money: true },
        ],
        rows,
      };
    },
  },
  {
    key: "ctc-by-department",
    label: "Cost-to-Company by Department",
    description: "Annual CTC rolled up by department with headcount and average.",
    category: "Payroll",
    async run({ orgId }) {
      const sals = await activeSalaries(orgId);
      const emps = sals.length ? await prisma.employee.findMany({
        where: { orgId, id: { in: sals.map((s) => s.employeeId) } },
        select: { id: true, department: { select: { name: true } } },
      }) : [];
      const deptOf = new Map(emps.map((e) => [e.id, e.department?.name ?? "(Unassigned)"]));
      const map = new Map<string, { total: number; count: number }>();
      for (const s of sals) {
        const d = deptOf.get(s.employeeId) ?? "(Unassigned)";
        const row = map.get(d) ?? { total: 0, count: 0 };
        row.total += num(s.ctc);
        row.count++;
        map.set(d, row);
      }
      return {
        title: "Cost-to-Company by Department",
        columns: [
          { key: "department", label: "Department", width: 26 },
          { key: "headcount", label: "Headcount", width: 12 },
          { key: "totalCTC", label: "Total Annual CTC", width: 18, money: true },
          { key: "avgCTC", label: "Average CTC", width: 16, money: true },
        ],
        rows: [...map.entries()].sort((a, b) => b[1].total - a[1].total).map(([department, v]) => ({
          department, headcount: v.count, totalCTC: Math.round(v.total), avgCTC: Math.round(v.total / v.count),
        })),
      };
    },
  },
  {
    key: "salary-revision",
    label: "Salary Revision / Increment",
    description: "Salary records effective in the selected range, with revision reason.",
    category: "Payroll",
    usesDateRange: true,
    async run({ orgId, dateFrom, dateTo }) {
      const sals = await prisma.employeeSalary.findMany({
        where: { orgId, deletedAt: null, ...dateRange("effectiveFrom", dateFrom, dateTo) },
        orderBy: { effectiveFrom: "desc" },
      });
      const emps = sals.length ? await prisma.employee.findMany({
        where: { orgId, id: { in: [...new Set(sals.map((s) => s.employeeId))] } },
        select: { id: true, employeeCode: true, firstName: true, lastName: true, department: { select: { name: true } } },
      }) : [];
      const empMap = new Map(emps.map((e) => [e.id, e]));
      return {
        title: "Salary Revision / Increment",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 22 },
          { key: "department", label: "Department", width: 18 },
          { key: "ctc", label: "Annual CTC", width: 16, money: true },
          { key: "effectiveFrom", label: "Effective From", width: 14 },
          { key: "reason", label: "Revision Reason", width: 26 },
        ],
        rows: sals.map((s) => {
          const e = empMap.get(s.employeeId);
          return {
            code: e?.employeeCode ?? "",
            name: fullName(e),
            department: e?.department?.name ?? "",
            ctc: num(s.ctc),
            effectiveFrom: fmtDate(s.effectiveFrom),
            reason: s.revisionReason ?? "",
          };
        }),
      };
    },
  },
  {
    key: "lop-report",
    label: "Loss of Pay (LOP)",
    description: "Employees with LOP days in the scoped pay period.",
    category: "Payroll",
    usesDateRange: true,
    async run(ctx) {
      const { payslips, empMap } = await getScopedPayslips(ctx);
      const rows = payslips.filter((p) => num(p.lopDays) > 0).map((p) => {
        const e = empMap.get(p.employeeId);
        return {
          code: e?.employeeCode ?? "",
          name: fullName(e),
          department: e?.department?.name ?? "",
          period: `${fmtDate(p.periodStart)} → ${fmtDate(p.periodEnd)}`,
          workingDays: num(p.workingDays),
          paidDays: num(p.paidDays),
          lopDays: num(p.lopDays),
          net: num(p.netPay),
        };
      });
      return {
        title: "Loss of Pay (LOP) Report",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 22 },
          { key: "department", label: "Department", width: 18 },
          { key: "period", label: "Period", width: 22 },
          { key: "workingDays", label: "Working Days", width: 12 },
          { key: "paidDays", label: "Paid Days", width: 10 },
          { key: "lopDays", label: "LOP Days", width: 10 },
          { key: "net", label: "Net Pay", width: 14, money: true },
        ],
        rows,
      };
    },
  },
  {
    key: "payroll-variance",
    label: "Payroll Variance (MoM)",
    description: "Net-pay change per employee between the two most recent pay runs.",
    category: "Payroll",
    async run({ orgId }) {
      const runs = await prisma.payRun.findMany({
        where: { orgId, deletedAt: null }, orderBy: { periodStart: "desc" }, take: 2, select: { id: true, periodStart: true },
      });
      if (runs.length < 2) return { title: "Payroll Variance (MoM)", columns: [{ key: "note", label: "Note", width: 40 }], rows: [{ note: "Need at least two pay runs to compare." }] };
      const [curr, prev] = runs;
      const slips = await prisma.payslip.findMany({
        where: { orgId, deletedAt: null, payRunId: { in: [curr.id, prev.id] } },
        select: { employeeId: true, payRunId: true, netPay: true },
      });
      const currMap = new Map<string, number>(), prevMap = new Map<string, number>();
      for (const s of slips) (s.payRunId === curr.id ? currMap : prevMap).set(s.employeeId, num(s.netPay));
      const empIds = [...new Set(slips.map((s) => s.employeeId))];
      const emps = await prisma.employee.findMany({ where: { orgId, id: { in: empIds } }, select: { id: true, employeeCode: true, firstName: true, lastName: true } });
      return {
        title: "Payroll Variance (MoM)",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 24 },
          { key: "previous", label: "Previous Net", width: 16, money: true },
          { key: "current", label: "Current Net", width: 16, money: true },
          { key: "delta", label: "Change", width: 14, money: true },
        ],
        rows: emps.map((e) => {
          const p = prevMap.get(e.id) ?? 0, c = currMap.get(e.id) ?? 0;
          return { code: e.employeeCode, name: fullName(e), previous: p, current: c, delta: Math.round(c - p) };
        }).filter((r) => r.delta !== 0 || r.current !== r.previous),
      };
    },
  },
  {
    key: "arrears-adjustments",
    label: "Arrears / Adjustments",
    description: "Manual paid-days overrides and adjustments applied to pay runs.",
    category: "Payroll",
    async run({ orgId }) {
      const adj = await prisma.payRunAdjustment.findMany({
        where: { orgId },
        orderBy: { createdAt: "desc" },
        take: 5000,
      });
      const empIds = [...new Set(adj.map((a) => a.employeeId))];
      const emps = empIds.length ? await prisma.employee.findMany({ where: { orgId, id: { in: empIds } }, select: { id: true, employeeCode: true, firstName: true, lastName: true } }) : [];
      const empMap = new Map(emps.map((e) => [e.id, e]));
      return {
        title: "Arrears / Adjustments",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 24 },
          { key: "paidDaysOverride", label: "Paid Days Override", width: 16 },
          { key: "reason", label: "Reason", width: 32 },
        ],
        rows: adj.map((a) => {
          const e = empMap.get(a.employeeId);
          return { code: e?.employeeCode ?? "", name: fullName(e), paidDaysOverride: num(a.paidDaysOverride), reason: a.reason ?? "" };
        }),
      };
    },
  },
  {
    key: "salary-provisioning",
    label: "Salary Provisioning / Accrual",
    description: "Monthly cost provision by department: gross, employer PF/ESI, bonus and total cost.",
    category: "Payroll",
    usesDateRange: true,
    async run(ctx) {
      const { payslips, empMap } = await getScopedPayslips(ctx);
      const map = new Map<string, { gross: number; pfEr: number; esiEr: number; bonus: number }>();
      for (const p of payslips) {
        const dept = empMap.get(p.employeeId)?.department?.name ?? "(Unassigned)";
        const lines = p.lines as ScopedLine[];
        const row = map.get(dept) ?? { gross: 0, pfEr: 0, esiEr: 0, bonus: 0 };
        row.gross += num(p.grossEarnings);
        row.pfEr += lineByCode(lines, "EPF_ER") + lineByCode(lines, "EDLI_ER") + lineByCode(lines, "EPF_ADMIN");
        row.esiEr += lineByCode(lines, "ESI_ER");
        row.bonus += sumByCategory(lines, "Bonus");
        map.set(dept, row);
      }
      return {
        title: "Salary Provisioning / Accrual",
        columns: [
          { key: "department", label: "Department", width: 22 },
          { key: "gross", label: "Gross Earnings", width: 16, money: true },
          { key: "pfEr", label: "Employer PF", width: 14, money: true },
          { key: "esiEr", label: "Employer ESI", width: 14, money: true },
          { key: "bonus", label: "Bonus Provision", width: 16, money: true },
          { key: "totalCost", label: "Total Cost", width: 16, money: true },
        ],
        rows: [...map.entries()].sort((a, b) => b[1].gross - a[1].gross).map(([department, v]) => ({
          department,
          gross: Math.round(v.gross),
          pfEr: Math.round(v.pfEr),
          esiEr: Math.round(v.esiEr),
          bonus: Math.round(v.bonus),
          totalCost: Math.round(v.gross + v.pfEr + v.esiEr + v.bonus),
        })),
      };
    },
  },
];

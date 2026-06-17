import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { internalError, validationError } from "@/lib/api-response";
import { createAuditLog } from "@/lib/utils/audit";

type ReportKind = "register" | "deductions" | "pf-ecr" | "esi-challan" | "pt-challan" | "lwf-challan" | "variance";

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function monthBounds(month: string): { start: Date; end: Date } {
  // month = "YYYY-MM"
  const [y, m] = month.split("-").map(Number);
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0) };
}

function priorMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, "0")}`;
}

export const GET = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const url = new URL(req.url);
    const kind = (url.searchParams.get("kind") ?? "register") as ReportKind;
    const month = url.searchParams.get("month");
    const state = url.searchParams.get("state") ?? null;
    if (!month) return validationError("month parameter required (YYYY-MM)");

    const { start, end } = monthBounds(month);
    const payslips = await prisma.payslip.findMany({
      where: {
        orgId, deletedAt: null,
        periodStart: { gte: start },
        periodEnd: { lte: end },
        status: { in: ["Released", "Generated"] },
      },
      include: { lines: true, payRun: { select: { payDate: true, status: true } } },
    });

    if (payslips.length === 0 && kind !== "variance") {
      return validationError(`No payslips found for ${month}`);
    }

    const empIds = [...new Set(payslips.map((p) => p.employeeId))];
    const employees = await prisma.employee.findMany({
      where: { orgId, deletedAt: null, id: { in: empIds } },
      select: {
        id: true, employeeCode: true, firstName: true, lastName: true,
        panNumber: true, aadhaarNumber: true, gender: true, bankAccounts: true,
        department: { select: { name: true } },
        designation: { select: { title: true } },
        officeLocation: { select: { name: true, state: true } },
      },
    });
    const empMap = new Map(employees.map((e) => [e.id, e]));

    let csv = "";
    let fileName = "";

    if (kind === "register") {
      // Full payroll register
      // Discover all earning + deduction component names
      const earningCols = new Set<string>();
      const deductionCols = new Set<string>();
      for (const p of payslips) {
        for (const l of p.lines) {
          if (l.type === "Earning") earningCols.add(l.componentName);
          else if (l.type === "Deduction" || l.type === "StatutoryContribution") {
            if (["EPFEmployee", "ESIEmployee", "ProfessionalTax", "LabourWelfareFund", "IncomeTax", "LoanDeduction", "LOPDeduction"].includes(l.category)) {
              deductionCols.add(l.componentName);
            }
          }
        }
      }
      const earnArr = [...earningCols].sort();
      const dedArr = [...deductionCols].sort();
      const headers = [
        "Sl", "Emp Code", "Name", "Department", "Designation",
        "Days Worked", "LOP Days", "Paid Days",
        ...earnArr, "Gross Earnings",
        ...dedArr, "Total Deductions",
        "Net Pay", "PAN", "Bank Account", "IFSC",
      ];
      csv += headers.map(csvEscape).join(",") + "\n";
      let i = 1;
      for (const p of payslips) {
        const e = empMap.get(p.employeeId);
        if (!e) continue;
        const earnMap = new Map<string, number>();
        const dedMap = new Map<string, number>();
        for (const l of p.lines) {
          if (l.type === "Earning") earnMap.set(l.componentName, Number(l.amount));
          else if (l.type === "Deduction" || l.type === "StatutoryContribution") {
            if (["EPFEmployee", "ESIEmployee", "ProfessionalTax", "LabourWelfareFund", "IncomeTax", "LoanDeduction", "LOPDeduction"].includes(l.category)) {
              dedMap.set(l.componentName, Number(l.amount));
            }
          }
        }
        const bank = Array.isArray(e.bankAccounts) ? (e.bankAccounts as { accountNumber?: string; ifsc?: string; isPrimary?: boolean }[]) : [];
        const primary = bank.find((b) => b.isPrimary) ?? bank[0];
        const row = [
          i++, e.employeeCode, `${e.firstName} ${e.lastName}`, e.department?.name ?? "", e.designation?.title ?? "",
          Number(p.workingDays), Number(p.lopDays), Number(p.paidDays),
          ...earnArr.map((c) => (earnMap.get(c) ?? 0).toFixed(2)),
          Number(p.grossEarnings).toFixed(2),
          ...dedArr.map((c) => (dedMap.get(c) ?? 0).toFixed(2)),
          Number(p.totalDeductions).toFixed(2),
          Number(p.netPay).toFixed(2),
          e.panNumber ?? "", primary?.accountNumber ?? "", primary?.ifsc ?? "",
        ];
        csv += row.map(csvEscape).join(",") + "\n";
      }
      fileName = `PayrollRegister-${month}.csv`;
    }
    else if (kind === "deductions") {
      csv += "Sl,Emp Code,Name,Department,EPF (Employee),ESI (Employee),Professional Tax,LWF,Income Tax (TDS),Loan Deduction,LOP Deduction,Total Deductions\n";
      let i = 1;
      for (const p of payslips) {
        const e = empMap.get(p.employeeId);
        if (!e) continue;
        const get = (cat: string) => p.lines.filter((l) => l.category === cat).reduce((s, l) => s + Number(l.amount), 0);
        csv += [
          i++, e.employeeCode, `${e.firstName} ${e.lastName}`, e.department?.name ?? "",
          get("EPFEmployee").toFixed(2), get("ESIEmployee").toFixed(2),
          get("ProfessionalTax").toFixed(2), get("LabourWelfareFund").toFixed(2),
          get("IncomeTax").toFixed(2), get("LoanDeduction").toFixed(2),
          get("LOPDeduction").toFixed(2), Number(p.totalDeductions).toFixed(2),
        ].map(csvEscape).join(",") + "\n";
      }
      fileName = `Deductions-${month}.csv`;
    }
    else if (kind === "pf-ecr") {
      // EPF Electronic Challan Return — UAN-based, PF wage, EPF/EPS/Pension contributions
      csv += "UAN,Member Name,Gross Wages,EPF Wages,EPS Wages,EDLI Wages,EPF Contribution Remitted,EPS Contribution Remitted,EPF EPS Diff Remitted,NCP Days,Refund of Advances\n";
      for (const p of payslips) {
        const e = empMap.get(p.employeeId);
        if (!e) continue;
        const gross = Number(p.grossEarnings);
        const epfEmp = p.lines.filter((l) => l.category === "EPFEmployee").reduce((s, l) => s + Number(l.amount), 0);
        const epfEr = p.lines.filter((l) => l.category === "EPFEmployer").reduce((s, l) => s + Number(l.amount), 0);
        const pfWage = epfEmp > 0 ? Math.round(epfEmp / 0.12) : 0;
        const epsWage = Math.min(pfWage, 15000);
        const epsContrib = Math.round(epsWage * 0.0833);
        const csvRow = [
          "", `${e.firstName} ${e.lastName}`, gross.toFixed(0), pfWage.toFixed(0),
          epsWage.toFixed(0), pfWage.toFixed(0),
          epfEmp.toFixed(0), epsContrib.toFixed(0), Math.max(0, epfEr - epsContrib).toFixed(0),
          Number(p.lopDays).toFixed(0), "0",
        ];
        csv += csvRow.map(csvEscape).join("#~#") + "\n"; // ECR uses #~# delimiter
      }
      fileName = `PF-ECR-${month}.txt`;
    }
    else if (kind === "esi-challan") {
      csv += "Sl,IP Number,Name,No. of Days,Total Wages,IP Contribution,Reason for Zero\n";
      let i = 1;
      for (const p of payslips) {
        const e = empMap.get(p.employeeId);
        if (!e) continue;
        const esiEmp = p.lines.filter((l) => l.category === "ESIEmployee").reduce((s, l) => s + Number(l.amount), 0);
        if (esiEmp === 0) continue;
        csv += [
          i++, "", `${e.firstName} ${e.lastName}`,
          Number(p.paidDays).toFixed(0),
          Number(p.grossEarnings).toFixed(2),
          esiEmp.toFixed(2),
          "",
        ].map(csvEscape).join(",") + "\n";
      }
      fileName = `ESI-Challan-${month}.csv`;
    }
    else if (kind === "pt-challan") {
      csv += "Sl,Emp Code,Name,State,Gross,Professional Tax\n";
      let i = 1;
      for (const p of payslips) {
        const e = empMap.get(p.employeeId);
        if (!e) continue;
        const empState = e.officeLocation?.state ?? "";
        if (state && empState !== state) continue;
        const pt = p.lines.filter((l) => l.category === "ProfessionalTax").reduce((s, l) => s + Number(l.amount), 0);
        if (pt === 0) continue;
        csv += [
          i++, e.employeeCode, `${e.firstName} ${e.lastName}`, empState,
          Number(p.grossEarnings).toFixed(2), pt.toFixed(2),
        ].map(csvEscape).join(",") + "\n";
      }
      fileName = `PT-Challan-${state ?? "All"}-${month}.csv`;
    }
    else if (kind === "lwf-challan") {
      csv += "Sl,Emp Code,Name,State,LWF Employee,LWF Employer\n";
      let i = 1;
      for (const p of payslips) {
        const e = empMap.get(p.employeeId);
        if (!e) continue;
        const lwfEmp = p.lines.filter((l) => l.category === "LabourWelfareFund" && l.type === "Deduction").reduce((s, l) => s + Number(l.amount), 0);
        const lwfEr = p.lines.filter((l) => l.category === "LabourWelfareFund" && l.type === "StatutoryContribution").reduce((s, l) => s + Number(l.amount), 0);
        if (lwfEmp === 0 && lwfEr === 0) continue;
        csv += [
          i++, e.employeeCode, `${e.firstName} ${e.lastName}`, e.officeLocation?.state ?? "",
          lwfEmp.toFixed(2), lwfEr.toFixed(2),
        ].map(csvEscape).join(",") + "\n";
      }
      fileName = `LWF-Challan-${month}.csv`;
    }
    else if (kind === "variance") {
      const prevMonth = priorMonth(month);
      const { start: pStart, end: pEnd } = monthBounds(prevMonth);
      const prevPayslips = await prisma.payslip.findMany({
        where: {
          orgId, deletedAt: null,
          periodStart: { gte: pStart },
          periodEnd: { lte: pEnd },
          status: { in: ["Released", "Generated"] },
        },
        select: { employeeId: true, grossEarnings: true, totalDeductions: true, netPay: true },
      });
      const prevByEmp = new Map(prevPayslips.map((p) => [p.employeeId, p]));

      csv += `Sl,Emp Code,Name,Prev Net Pay (${prevMonth}),Curr Net Pay (${month}),Δ Net,% Δ,Prev Gross,Curr Gross,Δ Gross\n`;
      let i = 1;
      for (const p of payslips) {
        const e = empMap.get(p.employeeId);
        if (!e) continue;
        const prev = prevByEmp.get(p.employeeId);
        const prevNet = prev ? Number(prev.netPay) : 0;
        const currNet = Number(p.netPay);
        const dNet = currNet - prevNet;
        const pct = prevNet > 0 ? ((dNet / prevNet) * 100).toFixed(1) : "—";
        csv += [
          i++, e.employeeCode, `${e.firstName} ${e.lastName}`,
          prevNet.toFixed(2), currNet.toFixed(2), dNet.toFixed(2), pct,
          prev ? Number(prev.grossEarnings).toFixed(2) : "0.00",
          Number(p.grossEarnings).toFixed(2),
          (Number(p.grossEarnings) - (prev ? Number(prev.grossEarnings) : 0)).toFixed(2),
        ].map(csvEscape).join(",") + "\n";
      }
      fileName = `Variance-${prevMonth}-vs-${month}.csv`;
    }
    else {
      return validationError(`Unknown report kind: ${kind}`);
    }

    await createAuditLog({
      orgId, userId, action: "Export", entityType: "PayrollReport",
      changes: { kind, month, state }, request: req,
    });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("GET /payroll/reports error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.reports.read", "hrms.settings.write"], anyPermission: true });

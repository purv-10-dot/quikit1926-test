import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { internalError, validationError } from "@/lib/api-response";
import { createAuditLog } from "@/lib/utils/audit";

type ReturnKind = "esic-half-yearly" | "lwf-state-return" | "pf-ecr-full";

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function periodFromHalf(half: string): { start: Date; end: Date; label: string } {
  // half = YYYY-H1 (Apr-Sep) | YYYY-H2 (Oct-Mar of next year)
  const [yStr, h] = half.split("-");
  const y = Number(yStr);
  if (h === "H1") return { start: new Date(y, 3, 1), end: new Date(y, 8, 30), label: `Apr-Sep ${y}` };
  return { start: new Date(y, 9, 1), end: new Date(y + 1, 2, 31), label: `Oct ${y} - Mar ${y + 1}` };
}

export const GET = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const url = new URL(req.url);
    const kind = (url.searchParams.get("kind") ?? "esic-half-yearly") as ReturnKind;

    if (kind === "esic-half-yearly") {
      const half = url.searchParams.get("half");
      if (!half) return validationError("half parameter required (e.g. 2026-H1 or 2026-H2)");
      const { start, end, label } = periodFromHalf(half);

      const payslips = await prisma.payslip.findMany({
        where: {
          orgId, deletedAt: null,
          periodStart: { gte: start },
          periodEnd: { lte: end },
          status: { in: ["Released", "Generated"] },
        },
        include: { lines: { where: { OR: [{ category: "ESIEmployee" }, { category: "ESIEmployer" }] } } },
      });

      const empIds = [...new Set(payslips.map((p) => p.employeeId))];
      const employees = await prisma.employee.findMany({
        where: { orgId, deletedAt: null, id: { in: empIds } },
        select: { id: true, employeeCode: true, firstName: true, lastName: true, esiNumber: true, dateOfJoining: true, lastWorkingDate: true },
      });
      const empMap = new Map(employees.map((e) => [e.id, e]));

      // Aggregate per employee for the half
      const agg = new Map<string, { gross: number; days: number; empContrib: number; erContrib: number; months: number }>();
      for (const p of payslips) {
        const c = agg.get(p.employeeId) ?? { gross: 0, days: 0, empContrib: 0, erContrib: 0, months: 0 };
        c.gross += Number(p.grossEarnings);
        c.days += Number(p.paidDays);
        c.months += 1;
        for (const l of p.lines) {
          if (l.category === "ESIEmployee") c.empContrib += Number(l.amount);
          else if (l.category === "ESIEmployer") c.erContrib += Number(l.amount);
        }
        agg.set(p.employeeId, c);
      }

      let csv = `# ESIC Half-Yearly Return\n# Period: ${label}\n# Generated: ${new Date().toISOString()}\n\n`;
      csv += "Sl,IP Number,Emp Code,Name,Date of Joining,Date of Leaving,Total Days,Total Wages,IP Contribution,ER Contribution,Reason\n";
      let i = 1;
      for (const [empId, c] of agg) {
        const e = empMap.get(empId);
        if (!e) continue;
        const reason = c.empContrib === 0 ? "Wage exceeded ceiling / Not eligible" : "";
        csv += [
          i++, e.esiNumber ?? "", e.employeeCode, `${e.firstName} ${e.lastName}`,
          e.dateOfJoining.toISOString().slice(0, 10),
          e.lastWorkingDate ? e.lastWorkingDate.toISOString().slice(0, 10) : "",
          c.days.toFixed(0), c.gross.toFixed(2),
          c.empContrib.toFixed(2), c.erContrib.toFixed(2),
          reason,
        ].map(csvEscape).join(",") + "\n";
      }

      await createAuditLog({
        orgId, userId, action: "Export", entityType: "StatutoryReturn",
        changes: { kind, half }, request: req,
      });
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="ESIC-HalfYearly-${half}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (kind === "lwf-state-return") {
      const half = url.searchParams.get("half");
      const state = url.searchParams.get("state");
      if (!half) return validationError("half parameter required");
      if (!state) return validationError("state parameter required");
      const { start, end, label } = periodFromHalf(half);

      const payslips = await prisma.payslip.findMany({
        where: {
          orgId, deletedAt: null,
          periodStart: { gte: start },
          periodEnd: { lte: end },
          status: { in: ["Released", "Generated"] },
        },
        include: { lines: { where: { category: "LabourWelfareFund" } } },
      });

      const empIds = [...new Set(payslips.map((p) => p.employeeId))];
      const employees = await prisma.employee.findMany({
        where: { orgId, deletedAt: null, id: { in: empIds } },
        select: {
          id: true, employeeCode: true, firstName: true, lastName: true, gender: true,
          designation: { select: { title: true } },
          officeLocation: { select: { state: true } },
        },
      });
      const empMap = new Map(employees.map((e) => [e.id, e]));

      const agg = new Map<string, { empContrib: number; erContrib: number }>();
      for (const p of payslips) {
        const e = empMap.get(p.employeeId);
        if (!e || e.officeLocation?.state !== state) continue;
        const c = agg.get(p.employeeId) ?? { empContrib: 0, erContrib: 0 };
        for (const l of p.lines) {
          if (l.type === "Deduction") c.empContrib += Number(l.amount);
          else if (l.type === "StatutoryContribution") c.erContrib += Number(l.amount);
        }
        agg.set(p.employeeId, c);
      }

      let csv = `# LWF Return — ${state}\n# Period: ${label}\n\n`;
      csv += "Sl,Emp Code,Name,Gender,Designation,Employee LWF,Employer LWF,Total\n";
      let i = 1;
      for (const [empId, c] of agg) {
        const e = empMap.get(empId);
        if (!e) continue;
        if (c.empContrib === 0 && c.erContrib === 0) continue;
        csv += [
          i++, e.employeeCode, `${e.firstName} ${e.lastName}`, e.gender ?? "",
          e.designation?.title ?? "",
          c.empContrib.toFixed(2), c.erContrib.toFixed(2),
          (c.empContrib + c.erContrib).toFixed(2),
        ].map(csvEscape).join(",") + "\n";
      }

      await createAuditLog({
        orgId, userId, action: "Export", entityType: "StatutoryReturn",
        changes: { kind, half, state }, request: req,
      });
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="LWF-${state}-${half}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (kind === "pf-ecr-full") {
      const month = url.searchParams.get("month");
      if (!month) return validationError("month parameter required (YYYY-MM)");
      const [y, m] = month.split("-").map(Number);
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0);

      const payslips = await prisma.payslip.findMany({
        where: {
          orgId, deletedAt: null,
          periodStart: { gte: start },
          periodEnd: { lte: end },
          status: { in: ["Released", "Generated"] },
        },
        include: { lines: { where: { OR: [{ category: "EPFEmployee" }, { category: "EPFEmployer" }] } } },
      });

      const empIds = [...new Set(payslips.map((p) => p.employeeId))];
      const employees = await prisma.employee.findMany({
        where: { orgId, deletedAt: null, id: { in: empIds } },
        select: { id: true, employeeCode: true, firstName: true, lastName: true, uanNumber: true, pfAccountNumber: true },
      });
      const empMap = new Map(employees.map((e) => [e.id, e]));

      // EPFO ECR v2.0 spec: 11 fields, #~# delimited, no header
      let csv = "";
      for (const p of payslips) {
        const e = empMap.get(p.employeeId);
        if (!e) continue;
        const gross = Math.round(Number(p.grossEarnings));
        const epfEmp = Math.round(p.lines.filter((l) => l.category === "EPFEmployee").reduce((s, l) => s + Number(l.amount), 0));
        const epfEr = Math.round(p.lines.filter((l) => l.category === "EPFEmployer").reduce((s, l) => s + Number(l.amount), 0));
        if (epfEmp === 0 && epfEr === 0) continue;
        const pfWage = epfEmp > 0 ? Math.round(epfEmp / 0.12) : 0;
        const epsWage = Math.min(pfWage, 15000);
        const epsContrib = Math.round(epsWage * 0.0833);
        const ncpDays = Math.round(Number(p.lopDays));

        const row = [
          e.uanNumber ?? "",                               // 1. UAN
          `${e.firstName} ${e.lastName}`.trim(),           // 2. Member Name
          gross,                                           // 3. Gross Wages
          pfWage,                                          // 4. EPF Wages
          epsWage,                                         // 5. EPS Wages
          pfWage,                                          // 6. EDLI Wages
          epfEmp,                                          // 7. EPF Contribution Remitted
          epsContrib,                                      // 8. EPS Contribution Remitted
          Math.max(0, epfEr - epsContrib),                 // 9. EPF EPS Diff Remitted
          ncpDays,                                         // 10. NCP Days
          0,                                               // 11. Refund of Advances
        ];
        csv += row.join("#~#") + "\n";
      }

      await createAuditLog({
        orgId, userId, action: "Export", entityType: "StatutoryReturn",
        changes: { kind, month }, request: req,
      });
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="ECR-${month}.txt"`,
          "Cache-Control": "no-store",
        },
      });
    }

    return validationError("Unknown kind");
  } catch (e) {
    console.error("GET /payroll/statutory-returns error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.reports.read", "hrms.settings.write"], anyPermission: true });

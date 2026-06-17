import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { internalError, notFound } from "@/lib/api-response";
import { utils, write } from "xlsx";

/**
 * Export all tax / statutory contribution details for a pay run as an Excel
 * workbook. One row per employee, columns for every statutory component
 * (EPF, ESI, PT, LWF, TDS, Bonus) plus identity (PAN, UAN, ESI No., PF No.).
 *
 * Available for any pay run that has computed payslips — works on Draft runs
 * for preview as well as Approved / Paid runs for compliance filing.
 */
export const GET = withAuth(async (_req: NextRequest, { orgId }, { id }) => {
  try {
    const run = await prisma.payRun.findFirst({
      where: { id, orgId, deletedAt: null },
      include: {
        payslips: {
          include: { lines: { orderBy: { sortOrder: "asc" } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!run) return notFound("Pay run not found");

    const employeeIds = run.payslips.map((p) => p.employeeId);
    const employees = employeeIds.length
      ? await prisma.employee.findMany({
          where: { orgId, deletedAt: null, id: { in: employeeIds } },
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            workEmail: true,
            panNumber: true,
            uanNumber: true,
            pfAccountNumber: true,
            esiNumber: true,
            aadhaarNumber: true,
            department: { select: { name: true } },
            designation: { select: { title: true } },
          },
        })
      : [];
    const empMap = new Map(employees.map((e) => [e.id, e]));

    type Line = (typeof run.payslips)[number]["lines"][number];
    const findByCode = (lines: Line[], code: string): number => {
      const ln = lines.find((l) => l.componentCode === code);
      return ln ? Number(ln.amount) : 0;
    };
    const sumByCategory = (lines: Line[], category: string): number =>
      lines.filter((l) => l.category === category).reduce((s, l) => s + Number(l.amount), 0);

    const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

    const rows = run.payslips.map((p) => {
      const e = empMap.get(p.employeeId);
      return {
        "Employee Code": e?.employeeCode ?? "",
        "Employee Name": e ? `${e.firstName} ${e.lastName}`.trim() : "",
        "Department": e?.department?.name ?? "",
        "Designation": e?.designation?.title ?? "",
        "Work Email": e?.workEmail ?? "",
        "PAN": e?.panNumber ?? "",
        "Aadhaar": e?.aadhaarNumber ?? "",
        "UAN": e?.uanNumber ?? "",
        "PF Account No.": e?.pfAccountNumber ?? "",
        "ESI No.": e?.esiNumber ?? "",
        "Period Start": fmtDate(p.periodStart),
        "Period End": fmtDate(p.periodEnd),
        "Working Days": Number(p.workingDays),
        "Paid Days": Number(p.paidDays),
        "LOP Days": Number(p.lopDays),
        "Basic": sumByCategory(p.lines, "Basic"),
        "DA": sumByCategory(p.lines, "DA"),
        "Gross Earnings": Number(p.grossEarnings),
        "EPF (Employee)": findByCode(p.lines, "EPF_EMP"),
        "EPF (Employer)": findByCode(p.lines, "EPF_ER"),
        "EDLI (Employer)": findByCode(p.lines, "EDLI_ER"),
        "EPF Admin (Employer)": findByCode(p.lines, "EPF_ADMIN"),
        "ESI (Employee)": findByCode(p.lines, "ESI_EMP"),
        "ESI (Employer)": findByCode(p.lines, "ESI_ER"),
        "Professional Tax": sumByCategory(p.lines, "ProfessionalTax"),
        "LWF (Employee)": sumByCategory(p.lines, "LWFEmployee"),
        "LWF (Employer)": sumByCategory(p.lines, "LWFEmployer"),
        "TDS (Income Tax)": sumByCategory(p.lines, "IncomeTax"),
        "Statutory Bonus (Provision)": sumByCategory(p.lines, "Bonus"),
        "Total Deductions": Number(p.totalDeductions),
        "Net Pay": Number(p.netPay),
        "Currency": run.currency,
        "Status": p.status,
      };
    });

    // Append a totals row for quick reconciliation.
    if (rows.length > 0) {
      const numericCols = [
        "Basic", "DA", "Gross Earnings",
        "EPF (Employee)", "EPF (Employer)", "EDLI (Employer)", "EPF Admin (Employer)",
        "ESI (Employee)", "ESI (Employer)",
        "Professional Tax", "LWF (Employee)", "LWF (Employer)",
        "TDS (Income Tax)", "Statutory Bonus (Provision)",
        "Total Deductions", "Net Pay",
      ];
      const totalsRow: Record<string, string | number> = { "Employee Code": "TOTAL", "Employee Name": `${rows.length} employees` };
      for (const col of numericCols) {
        totalsRow[col] = rows.reduce((s, r) => s + Number((r as Record<string, number | string>)[col] ?? 0), 0);
      }
      rows.push(totalsRow as (typeof rows)[number]);
    }

    const ws = utils.json_to_sheet(rows);

    // Column widths — make the wider identity / name columns more readable.
    const widths: number[] = [
      14, 24, 18, 22, 26,            // EmpCode, Name, Dept, Designation, Email
      14, 16, 16, 18, 18,            // PAN, Aadhaar, UAN, PF, ESI
      12, 12, 10, 10, 10,            // dates + day counts
      12, 12, 14,                    // Basic, DA, Gross
      14, 14, 14, 18,                // EPF block
      14, 14,                        // ESI
      14, 14, 14, 16, 22,            // PT, LWF emp/empr, TDS, Bonus
      14, 12, 10, 10,                // Total Ded, Net, Currency, Status
    ];
    (ws as { "!cols"?: { wch: number }[] })["!cols"] = widths.map((w) => ({ wch: w }));

    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Tax Details");

    const buf = write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const monthLabel = run.periodStart
      .toLocaleDateString("en-IN", { month: "short", year: "numeric" })
      .replace(/\s+/g, "-");
    const filename = `tax-details-${monthLabel}-${run.id}.xlsx`;

    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("GET /payroll/runs/[id]/tax-export error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

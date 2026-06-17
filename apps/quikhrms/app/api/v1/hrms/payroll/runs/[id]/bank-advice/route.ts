import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { internalError, notFound, validationError } from "@/lib/api-response";
import { createAuditLog } from "@/lib/utils/audit";

interface BankAccount {
  bankName?: string;
  accountNumber?: string;
  ifsc?: string;
  branch?: string;
  isPrimary?: boolean;
}

function pickBank(json: unknown): BankAccount | null {
  if (!json || !Array.isArray(json)) return null;
  const accounts = json as BankAccount[];
  return accounts.find((a) => a.isPrimary) ?? accounts[0] ?? null;
}

function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export const GET = withAuth(async (req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const url = new URL(req.url);
    const format = (url.searchParams.get("format") ?? "generic").toLowerCase();

    const run = await prisma.payRun.findFirst({
      where: { id, orgId, deletedAt: null },
      select: { id: true, periodStart: true, periodEnd: true, payDate: true, status: true },
    });
    if (!run) return notFound("Pay run not found");
    if (run.status !== "Approved" && run.status !== "Paid") {
      return validationError("Bank advice can only be generated for Approved or Paid pay runs");
    }

    const payslips = await prisma.payslip.findMany({
      where: { orgId, payRunId: id, deletedAt: null },
      select: { id: true, employeeId: true, netPay: true },
    });
    const employees = await prisma.employee.findMany({
      where: { orgId, deletedAt: null, id: { in: payslips.map((p) => p.employeeId) } },
      select: { id: true, firstName: true, lastName: true, employeeCode: true, bankAccounts: true },
    });
    const empMap = new Map(employees.map((e) => [e.id, e]));

    const payDateStr = run.payDate.toISOString().slice(0, 10);
    const remarks = `Salary ${run.periodStart.toISOString().slice(0, 7)}`;

    let csv = "";
    if (format === "hdfc") {
      csv = "PYMT_PROD_TYPE_CODE,PYMT_MODE,DEBIT_ACC_NO,BNF_NAME,BENE_ACC_NO,BNF_BANK_CODE,BNF_NAME_W_BANK,PYMT_DATE,DEBIT_AMT,BENE_EMAIL,REMARKS\n";
      for (const p of payslips) {
        const e = empMap.get(p.employeeId);
        const b = e ? pickBank(e.bankAccounts) : null;
        if (!e || !b?.accountNumber || !b?.ifsc) continue;
        const name = `${e.firstName} ${e.lastName}`.trim();
        csv += [
          "PAYROLL", "NEFT", "", csvEscape(name), csvEscape(b.accountNumber), csvEscape(b.ifsc),
          csvEscape(name), payDateStr, Number(p.netPay).toFixed(2), "", csvEscape(remarks),
        ].join(",") + "\n";
      }
    } else if (format === "icici") {
      csv = "PYMT_MODE,BENE_NAME,BENE_ACC_NO,IFSC,AMOUNT,PAYMENT_DATE,NARRATION\n";
      for (const p of payslips) {
        const e = empMap.get(p.employeeId);
        const b = e ? pickBank(e.bankAccounts) : null;
        if (!e || !b?.accountNumber || !b?.ifsc) continue;
        const name = `${e.firstName} ${e.lastName}`.trim();
        csv += [
          "NEFT", csvEscape(name), csvEscape(b.accountNumber), csvEscape(b.ifsc),
          Number(p.netPay).toFixed(2), payDateStr, csvEscape(remarks),
        ].join(",") + "\n";
      }
    } else if (format === "sbi") {
      // SBI Cinb format (pipe-delimited common variant)
      csv = "Sl.No|Beneficiary Name|Beneficiary Account|IFSC|Amount|Mode|Remarks|Pay Date\n";
      let i = 1;
      for (const p of payslips) {
        const e = empMap.get(p.employeeId);
        const b = e ? pickBank(e.bankAccounts) : null;
        if (!e || !b?.accountNumber || !b?.ifsc) continue;
        const name = `${e.firstName} ${e.lastName}`.trim();
        csv += [
          i++, name, b.accountNumber, b.ifsc,
          Number(p.netPay).toFixed(2), "NEFT", remarks, payDateStr,
        ].join("|") + "\n";
      }
    } else {
      // Generic
      csv = "Sl.No,Employee Code,Employee Name,Bank Name,Account Number,IFSC,Amount,Pay Date,Remarks\n";
      let i = 1;
      for (const p of payslips) {
        const e = empMap.get(p.employeeId);
        const b = e ? pickBank(e.bankAccounts) : null;
        if (!e) continue;
        const name = `${e.firstName} ${e.lastName}`.trim();
        csv += [
          i++,
          csvEscape(e.employeeCode),
          csvEscape(name),
          csvEscape(b?.bankName ?? ""),
          csvEscape(b?.accountNumber ?? ""),
          csvEscape(b?.ifsc ?? ""),
          Number(p.netPay).toFixed(2),
          payDateStr,
          csvEscape(remarks),
        ].join(",") + "\n";
      }
    }

    await createAuditLog({
      orgId, userId, action: "Export", entityType: "PayRun", entityId: id,
      changes: { artifact: "BankAdvice", format, employeeCount: payslips.length },
    });

    const fileName = `BankAdvice-${format}-${payDateStr}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("GET /payroll/runs/[id]/bank-advice error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

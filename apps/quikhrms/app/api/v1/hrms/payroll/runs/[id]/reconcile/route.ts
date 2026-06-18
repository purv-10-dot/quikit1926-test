import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError, notFound } from "@/lib/api-response";
import { createAuditLog } from "@/lib/utils/audit";

/**
 * Body shape:
 *   { fileName?: string; csv: string; columnMap?: { name?: number; account?: number; ifsc?: number; amount: number; date?: number; ref?: number }; delimiter?: "," | "|" | "\t" }
 *
 * Default columnMap assumes: 0=Date, 1=Description (name), 2=Reference, 3=Amount, optional 4=Account, 5=IFSC
 */

interface BankAccountJson { accountNumber?: string; isPrimary?: boolean }

function parseCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === delimiter && !inQ) {
      out.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function normalize(v: string): string {
  return v.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

export const GET = withAuth(async (_req: NextRequest, { orgId }, { id }) => {
  try {
    const recons = await prisma.bankReconciliation.findMany({
      where: { orgId, payRunId: id, deletedAt: null },
      include: { lines: true },
      orderBy: { uploadedAt: "desc" },
    });
    return successResponse(recons);
  } catch (e) {
    console.error("GET /payroll/runs/[id]/reconcile error:", e);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const body = await req.json();
    const csv: string = body.csv ?? "";
    const fileName: string | null = body.fileName ?? null;
    const delimiter: string = body.delimiter ?? ",";
    const columnMap = body.columnMap ?? { date: 0, name: 1, ref: 2, amount: 3, account: 4, ifsc: 5 };

    if (!csv.trim()) return validationError("csv body required");

    const run = await prisma.payRun.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!run) return notFound("Pay run not found");

    const payslips = await prisma.payslip.findMany({
      where: { orgId, payRunId: id, deletedAt: null },
      select: { id: true, employeeId: true, netPay: true },
    });
    const empIds = payslips.map((p) => p.employeeId);
    const employees = await prisma.employee.findMany({
      where: { orgId, deletedAt: null, id: { in: empIds } },
      select: { id: true, firstName: true, lastName: true, employeeCode: true, bankAccounts: true },
    });

    interface LineMatch {
      payslipId: string;
      employeeId: string;
      net: number;
      name: string;
      accountLast4: string;
    }
    const candidates: LineMatch[] = [];
    for (const p of payslips) {
      const e = employees.find((x) => x.id === p.employeeId);
      if (!e) continue;
      const banks = Array.isArray(e.bankAccounts) ? (e.bankAccounts as BankAccountJson[]) : [];
      const primary = banks.find((b) => b.isPrimary) ?? banks[0];
      const acc = primary?.accountNumber ?? "";
      candidates.push({
        payslipId: p.id,
        employeeId: e.id,
        net: Number(p.netPay),
        name: normalize(`${e.firstName}${e.lastName}`),
        accountLast4: acc.slice(-4),
      });
    }

    const lines = csv.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length === 0) return validationError("Empty CSV");
    // Skip header if first row contains non-numeric in amount column
    let startIdx = 0;
    const probe = parseCsvLine(lines[0], delimiter);
    if (Number.isNaN(Number(probe[columnMap.amount]?.replace(/,/g, "")))) startIdx = 1;

    let totalDebited = 0;
    let totalMatched = 0;
    let matchedCount = 0;
    let unmatchedCount = 0;
    const lineRecords: {
      payslipId: string | null;
      employeeName: string;
      bankAccount: string | null;
      ifsc: string | null;
      amount: number;
      txnDate: Date | null;
      txnRef: string | null;
      matched: boolean;
      matchReason: string | null;
    }[] = [];

    const usedPayslipIds = new Set<string>();

    for (let i = startIdx; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i], delimiter);
      const amtRaw = cols[columnMap.amount] ?? "";
      const amt = Number(amtRaw.replace(/,/g, ""));
      if (!Number.isFinite(amt) || amt <= 0) continue;
      const name = cols[columnMap.name ?? 1] ?? "";
      const ref = columnMap.ref != null ? cols[columnMap.ref] ?? null : null;
      const dateStr = columnMap.date != null ? cols[columnMap.date] ?? "" : "";
      const account = columnMap.account != null ? cols[columnMap.account] ?? "" : "";
      const ifsc = columnMap.ifsc != null ? cols[columnMap.ifsc] ?? "" : "";

      totalDebited += amt;
      const normName = normalize(name);

      // Match strategy: amount exact + (account last4 OR name contains)
      const candidate = candidates.find((c) => {
        if (usedPayslipIds.has(c.payslipId)) return false;
        if (Math.abs(c.net - amt) > 1) return false;
        if (account && c.accountLast4 && account.includes(c.accountLast4)) return true;
        if (normName && c.name && (normName.includes(c.name) || c.name.includes(normName))) return true;
        return false;
      });

      let matched = false;
      let matchReason: string | null = null;
      let payslipId: string | null = null;
      if (candidate) {
        matched = true;
        payslipId = candidate.payslipId;
        usedPayslipIds.add(candidate.payslipId);
        totalMatched += amt;
        matchedCount++;
        matchReason = "amount + name/account match";
      } else {
        unmatchedCount++;
        matchReason = "no payslip with same amount + name/account";
      }

      lineRecords.push({
        payslipId,
        employeeName: name,
        bankAccount: account || null,
        ifsc: ifsc || null,
        amount: amt,
        txnDate: dateStr ? new Date(dateStr) : null,
        txnRef: ref,
        matched,
        matchReason,
      });
    }

    const status =
      unmatchedCount === 0 ? "Matched" :
      matchedCount === 0 ? "Unmatched" :
      "PartiallyMatched";

    const recon = await prisma.bankReconciliation.create({
      data: {
        orgId,
        payRunId: id,
        uploadedBy: userId,
        fileName,
        totalDebited,
        totalMatched,
        matchedCount,
        unmatchedCount,
        status,
        lines: {
          createMany: {
            data: lineRecords.map((l) => ({
              orgId,
              payslipId: l.payslipId,
              employeeName: l.employeeName,
              bankAccount: l.bankAccount,
              ifsc: l.ifsc,
              amount: l.amount,
              txnDate: l.txnDate && !Number.isNaN(l.txnDate.getTime()) ? l.txnDate : null,
              txnRef: l.txnRef,
              matched: l.matched,
              matchReason: l.matchReason,
            })),
          },
        },
      },
      include: { lines: true },
    });

    await createAuditLog({
      orgId, userId, action: "Create", entityType: "BankReconciliation", entityId: recon.id,
      changes: { fileName, totalDebited, matchedCount, unmatchedCount, status }, request: req,
    });
    return successResponse(recon, undefined, 201);
  } catch (e) {
    console.error("POST /payroll/runs/[id]/reconcile error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

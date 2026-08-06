import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createAuditLog } from "@/lib/utils/audit";
import { zBankAccount, zIfscOptional } from "@/lib/validations/identifiers";

// Real-format validation: account number must be 9–18 digits, IFSC (optional)
// must be a valid IFSC. Validated per-row below so a bad value fails ONLY that
// row, not the whole upload.
const bankRowSchema = z.object({
  employeeCode: z.string().min(1),
  bankName: z.string().optional().nullable(),
  accountNumber: zBankAccount,
  accountHolder: z.string().optional().nullable(),
  ifscCode: zIfscOptional,
  branch: z.string().optional().nullable(),
  accountType: z.string().optional().nullable(),
});

// Rows accepted loosely here (only count is enforced) so ONE malformed value
// can't 400 the whole upload — each row is validated against bankRowSchema below.
const bulkBankSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(5000),
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = bulkBankSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const { rows } = parsed.data;

    const errors: Array<{ row: number; employeeCode: string; error: string }> = [];
    const valid: Array<{ row: number; data: z.infer<typeof bankRowSchema> }> = [];
    rows.forEach((raw, i) => {
      const res = bankRowSchema.safeParse(raw);
      if (res.success) {
        valid.push({ row: i + 1, data: res.data });
      } else {
        const codeGuess = typeof (raw as { employeeCode?: unknown }).employeeCode === "string" ? (raw as { employeeCode: string }).employeeCode : "";
        const msg = res.error.issues.map((iss) => `${iss.path.join(".") || "row"}: ${iss.message}`).join("; ");
        errors.push({ row: i + 1, employeeCode: codeGuess, error: msg || "Invalid row" });
      }
    });

    // Load matched employees WITH their current bank accounts so we can merge
    // rather than clobber.
    const codes = [...new Set(valid.map((v) => v.data.employeeCode.trim()))];
    const employees = codes.length
      ? await prisma.employee.findMany({
          where: { orgId, deletedAt: null, employeeCode: { in: codes } },
          select: { id: true, employeeCode: true, bankAccounts: true },
        })
      : [];
    const empByCode = new Map(employees.map((e) => [e.employeeCode.toLowerCase(), e]));

    // Build the per-employee merged bankAccounts: replace the existing primary
    // (or append if none), demote all others, keeping exactly one isPrimary: true.
    const toApply: Array<{ row: number; employeeCode: string; id: string; accounts: Record<string, unknown>[] }> = [];
    for (const v of valid) {
      const r = v.data;
      const emp = empByCode.get(r.employeeCode.trim().toLowerCase());
      if (!emp) { errors.push({ row: v.row, employeeCode: r.employeeCode, error: "Employee not found" }); continue; }

      const existing = Array.isArray(emp.bankAccounts) ? (emp.bankAccounts as Record<string, unknown>[]) : [];
      const primary: Record<string, unknown> = {
        bankName: r.bankName ?? "",
        accountNumber: r.accountNumber,
        accountHolder: r.accountHolder ?? "",
        ifscCode: r.ifscCode ?? "",
        branch: r.branch ?? "",
        accountType: r.accountType ?? "Savings",
        isPrimary: true,
      };
      const primaryIdx = existing.findIndex((a) => a && (a as { isPrimary?: unknown }).isPrimary === true);
      const demoted = existing.map((a) => ({ ...a, isPrimary: false }));
      const accounts = primaryIdx >= 0
        ? demoted.map((a, idx) => (idx === primaryIdx ? primary : a))
        : [...demoted, primary];
      toApply.push({ row: v.row, employeeCode: r.employeeCode, id: emp.id, accounts });
    }

    // Apply every valid row atomically — a mid-run failure rolls back the whole
    // batch (no partial commit) instead of leaving some employees updated.
    let updated = 0;
    if (toApply.length) {
      try {
        await prisma.$transaction(
          toApply.map((u) => prisma.employee.update({
            where: { id: u.id },
            data: { bankAccounts: JSON.parse(JSON.stringify(u.accounts)), updatedBy: userId },
          })),
        );
        updated = toApply.length;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Bulk update failed";
        for (const u of toApply) errors.push({ row: u.row, employeeCode: u.employeeCode, error: msg });
      }
    }

    await createAuditLog({
      orgId, userId, action: "Update", entityType: "Employee", entityId: "bulk-bank",
      changes: { total: rows.length, updated, failed: errors.length },
    });

    return successResponse({ total: rows.length, updated, failed: errors.length, errors });
  } catch (error) {
    console.error("POST /employees/bulk-bank-import error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.employee.write"] });

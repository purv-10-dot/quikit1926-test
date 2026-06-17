import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createAuditLog } from "@/lib/utils/audit";

const bankRowSchema = z.object({
  employeeCode: z.string().min(1),
  bankName: z.string().optional().nullable(),
  accountNumber: z.string().min(1),
  accountHolder: z.string().optional().nullable(),
  ifscCode: z.string().optional().nullable(),
  branch: z.string().optional().nullable(),
  accountType: z.string().optional().nullable(),
});

const bulkBankSchema = z.object({
  rows: z.array(bankRowSchema).min(1).max(5000),
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = bulkBankSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const { rows } = parsed.data;
    const codes = [...new Set(rows.map((r) => r.employeeCode.trim()))];

    const employees = await prisma.employee.findMany({
      where: { orgId, deletedAt: null, employeeCode: { in: codes } },
      select: { id: true, employeeCode: true },
    });
    const empByCode = new Map(employees.map((e) => [e.employeeCode.toLowerCase(), e.id]));

    let updated = 0;
    const errors: Array<{ row: number; employeeCode: string; error: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const id = empByCode.get(r.employeeCode.trim().toLowerCase());
      if (!id) {
        errors.push({ row: i + 1, employeeCode: r.employeeCode, error: "Employee not found" });
        continue;
      }
      try {
        const bankAccount = {
          bankName: r.bankName ?? "",
          accountNumber: r.accountNumber,
          accountHolder: r.accountHolder ?? "",
          ifscCode: r.ifscCode ?? "",
          branch: r.branch ?? "",
          accountType: r.accountType ?? "Savings",
          isPrimary: true,
        };
        await prisma.employee.update({
          where: { id },
          data: { bankAccounts: [bankAccount], updatedBy: userId },
        });
        updated++;
      } catch (e) {
        errors.push({ row: i + 1, employeeCode: r.employeeCode, error: e instanceof Error ? e.message : "Unknown error" });
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

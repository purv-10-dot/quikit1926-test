import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { bulkOneTimeEarningSchema } from "@/lib/validations/payroll";
import { createAuditLog } from "@/lib/utils/audit";
import { defaultsForKindForTenant, type OneTimeKind } from "@/lib/services/one-time-defaults";
import type { Prisma } from "@quikit/database";

interface RowError {
  row: number; // 1-based, matches Excel row (excluding header)
  employeeCode: string;
  error: string;
}

/**
 * Bulk import One-Time Earnings / Deductions.
 *
 * Accepts up to 1,000 rows in a single call. Resolves `employeeCode` →
 * employeeId per row, then inserts via `createMany`. Returns per-row failures
 * so the caller can show a granular error table.
 *
 * Everything is created in **Pending** status — the existing approval flow
 * handles them from there.
 */
export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = bulkOneTimeEarningSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }
    const { rows } = parsed.data;

    // Pre-fetch all referenced employees in one query.
    const codes = [...new Set(rows.map((r) => r.employeeCode.trim().toUpperCase()))];
    const employees = await prisma.employee.findMany({
      where: { orgId, deletedAt: null, employeeCode: { in: codes } },
      select: { id: true, employeeCode: true },
    });
    const codeToId = new Map(employees.map((e) => [e.employeeCode.toUpperCase(), e.id]));

    const errors: RowError[] = [];
    const okPayload: Prisma.OneTimeEarningCreateManyInput[] = [];

    // Pre-resolve all distinct Kind defaults for this tenant in one pass so
    // the loop doesn't hit the DB N times.
    const distinctKinds = [...new Set(rows.map((r) => r.kind))] as OneTimeKind[];
    const flagsByKind = new Map<OneTimeKind, Awaited<ReturnType<typeof defaultsForKindForTenant>>>();
    for (const k of distinctKinds) {
      flagsByKind.set(k, await defaultsForKindForTenant(orgId, k));
    }

    rows.forEach((r, idx) => {
      const rowNo = idx + 1;
      const code = r.employeeCode.trim().toUpperCase();
      const empId = codeToId.get(code);
      if (!empId) {
        errors.push({ row: rowNo, employeeCode: r.employeeCode, error: "Employee code not found" });
        return;
      }

      // Normalize pay period to YYYY-MM-01.
      let payPeriodIso: string;
      if (/^\d{4}-\d{2}-\d{2}$/.test(r.payPeriod)) {
        payPeriodIso = r.payPeriod.slice(0, 7) + "-01";
      } else if (/^\d{4}-\d{2}$/.test(r.payPeriod)) {
        payPeriodIso = `${r.payPeriod}-01`;
      } else {
        errors.push({ row: rowNo, employeeCode: r.employeeCode, error: `Invalid pay period "${r.payPeriod}". Use YYYY-MM.` });
        return;
      }

      // Statutory flags overridden from Kind defaults — same rule as single create.
      const flags = flagsByKind.get(r.kind as OneTimeKind)!;

      okPayload.push({
        orgId,
        employeeId: empId,
        kind: r.kind,
        category: r.category,
        componentCode: r.componentCode.toUpperCase(),
        componentName: r.componentName,
        amount: r.amount,
        payPeriod: new Date(payPeriodIso),
        taxable: flags.taxable,
        considerForEPF: flags.considerForEPF,
        considerForESI: flags.considerForESI,
        considerForPT: flags.considerForPT,
        reason: r.reason ?? null,
        status: "Pending",
        createdBy: userId,
        updatedBy: userId,
      });
    });

    let inserted = 0;
    if (okPayload.length > 0) {
      const result = await prisma.oneTimeEarning.createMany({ data: okPayload });
      inserted = result.count;

      await createAuditLog({
        orgId,
        userId,
        action: "Import",
        entityType: "OneTimeEarning",
        metadata: { count: inserted, failed: errors.length },
        request: req,
      });
    }

    return successResponse({
      inserted,
      failed: errors.length,
      total: rows.length,
      errors,
    }, undefined, 201);
  } catch (e) {
    console.error("POST /payroll/one-time-earnings/bulk error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

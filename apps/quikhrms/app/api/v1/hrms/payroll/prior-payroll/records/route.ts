import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { bulkPriorPayrollSchema, priorPayrollRecordSchema } from "@/lib/validations/payroll";
import { markStepCompleted } from "@/lib/services/payroll";
import { createAuditLog } from "@/lib/utils/audit";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const url = new URL(req.url);
    const employeeId = url.searchParams.get("employeeId");
    const fy = url.searchParams.get("fy");

    const records = await prisma.priorPayrollRecord.findMany({
      where: {
        orgId,
        deletedAt: null,
        ...(employeeId ? { employeeId } : {}),
        ...(fy ? { financialYear: fy } : {}),
      },
      orderBy: [{ employeeId: "asc" }, { periodStart: "asc" }],
    });
    return successResponse(records);
  } catch (e) {
    console.error("GET /payroll/prior-payroll/records error:", e);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const single = priorPayrollRecordSchema.safeParse(body);
    const bulk = bulkPriorPayrollSchema.safeParse(body);

    const records = single.success ? [single.data] : bulk.success ? bulk.data.records : null;
    if (!records) {
      const errors = bulk.error?.flatten().fieldErrors ?? single.error?.flatten().fieldErrors ?? {};
      return validationError("Validation failed", errors);
    }

    const results: { employeeId: string; periodStart: string; success: boolean; error?: string }[] = [];
    let succeeded = 0;

    for (const rec of records) {
      try {
        const periodStart = new Date(rec.periodStart);
        const periodEnd = new Date(rec.periodEnd);
        if (periodEnd < periodStart) {
          throw new Error("periodEnd before periodStart");
        }
        await prisma.priorPayrollRecord.upsert({
          where: {
            orgId_employeeId_periodStart: {
              orgId,
              employeeId: rec.employeeId,
              periodStart,
            },
          },
          create: {
            orgId,
            employeeId: rec.employeeId,
            financialYear: rec.financialYear,
            periodStart,
            periodEnd,
            grossEarnings: rec.grossEarnings,
            totalDeductions: rec.totalDeductions,
            netPay: rec.netPay,
            epfEmployee: rec.epfEmployee,
            epfEmployer: rec.epfEmployer,
            esiEmployee: rec.esiEmployee,
            esiEmployer: rec.esiEmployer,
            professionalTax: rec.professionalTax,
            tds: rec.tds,
            notes: rec.notes ?? null,
            createdBy: userId,
            updatedBy: userId,
          },
          update: {
            financialYear: rec.financialYear,
            periodEnd,
            grossEarnings: rec.grossEarnings,
            totalDeductions: rec.totalDeductions,
            netPay: rec.netPay,
            epfEmployee: rec.epfEmployee,
            epfEmployer: rec.epfEmployer,
            esiEmployee: rec.esiEmployee,
            esiEmployer: rec.esiEmployer,
            professionalTax: rec.professionalTax,
            tds: rec.tds,
            notes: rec.notes ?? null,
            updatedBy: userId,
          },
        });
        results.push({ employeeId: rec.employeeId, periodStart: rec.periodStart, success: true });
        succeeded++;
      } catch (err) {
        results.push({
          employeeId: rec.employeeId,
          periodStart: rec.periodStart,
          success: false,
          error: (err as Error).message,
        });
      }
    }

    if (succeeded > 0) {
      await prisma.priorPayroll.upsert({
        where: { orgId },
        update: { dataUploaded: true, updatedBy: userId },
        create: { orgId, enabled: true, dataUploaded: true, createdBy: userId, updatedBy: userId },
      });
      await markStepCompleted(orgId, userId, "priorPayrollCompleted");
      await createAuditLog({
        orgId, userId, action: "Create", entityType: "PriorPayrollRecord", entityId: "bulk",
        changes: { total: records.length, succeeded, failed: records.length - succeeded },
      });
    }

    return successResponse({
      total: records.length,
      succeeded,
      failed: records.length - succeeded,
      results,
    });
  } catch (e) {
    console.error("POST /payroll/prior-payroll/records error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

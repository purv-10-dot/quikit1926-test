import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { bulkAssignEmployeeSalarySchema } from "@/lib/validations/payroll";
import { markStepCompleted } from "@/lib/services/payroll";
import { createAuditLog } from "@/lib/utils/audit";

interface ItemResult {
  employeeId: string;
  success: boolean;
  salaryId?: string;
  error?: string;
}

export const POST = withAuth(
  async (req: NextRequest, { orgId, userId }) => {
    try {
      const body = await req.json();
      const parsed = bulkAssignEmployeeSalarySchema.safeParse(body);
      if (!parsed.success) {
        return validationError("Validation failed", parsed.error.flatten().fieldErrors);
      }

      const { assignments } = parsed.data;
      const employeeIds = [...new Set(assignments.map((a) => a.employeeId))];
      const structureIds = [...new Set(assignments.map((a) => a.structureId))];

      const [validEmployees, validStructures] = await Promise.all([
        prisma.employee.findMany({
          where: { id: { in: employeeIds }, orgId, deletedAt: null },
          select: { id: true },
        }),
        prisma.salaryStructure.findMany({
          where: { id: { in: structureIds }, orgId, deletedAt: null },
          select: { id: true },
        }),
      ]);

      const empSet = new Set(validEmployees.map((e) => e.id));
      const structSet = new Set(validStructures.map((s) => s.id));

      const results: ItemResult[] = [];
      let successCount = 0;

      // Process sequentially — avoids races on per-employee deactivation
      for (const a of assignments) {
        if (!empSet.has(a.employeeId)) {
          results.push({ employeeId: a.employeeId, success: false, error: "Employee not found" });
          continue;
        }
        if (!structSet.has(a.structureId)) {
          results.push({ employeeId: a.employeeId, success: false, error: "Salary structure not found" });
          continue;
        }

        try {
          const effectiveFrom = new Date(a.effectiveFrom);
          const record = await prisma.$transaction(async (tx) => {
            await tx.employeeSalary.updateMany({
              where: { orgId, employeeId: a.employeeId, deletedAt: null, isActive: true },
              data: { isActive: false, effectiveTo: effectiveFrom },
            });
            return tx.employeeSalary.create({
              data: {
                orgId,
                employeeId: a.employeeId,
                structureId: a.structureId,
                ctc: a.ctc,
                effectiveFrom,
                revisionReason: a.revisionReason ?? null,
                isActive: true,
                createdBy: userId,
                updatedBy: userId,
              },
              select: { id: true },
            });
          });
          results.push({ employeeId: a.employeeId, success: true, salaryId: record.id });
          successCount++;
        } catch (err) {
          results.push({
            employeeId: a.employeeId,
            success: false,
            error: (err as Error).message,
          });
        }
      }

      if (successCount > 0) {
        await markStepCompleted(orgId, userId, "employeesCompleted");
        await createAuditLog({
          orgId,
          userId,
          action: "Create",
          entityType: "EmployeeSalary",
          entityId: "bulk",
          changes: { total: assignments.length, succeeded: successCount, failed: assignments.length - successCount },
        });
      }

      return successResponse({
        total: assignments.length,
        succeeded: successCount,
        failed: assignments.length - successCount,
        results,
      });
    } catch (e) {
      console.error("POST /payroll/employee-salaries/bulk error:", e);
      return internalError();
    }
  },
  { requiredPermissions: ["hrms.settings.write"] },
);

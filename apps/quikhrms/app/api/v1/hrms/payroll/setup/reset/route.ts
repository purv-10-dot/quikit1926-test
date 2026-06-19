import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";

/**
 * Wipes payroll setup data for current tenant so checklist shows 0/7.
 * Destructive — protected by hrms.settings.write permission.
 */
export const POST = withAuth(async (_req: NextRequest, { orgId, userId }) => {
  try {
    await prisma.$transaction(async (tx) => {
      // Pay runs / payslips first (FK to EmployeeSalary / PayRun)
      await tx.payslip.deleteMany({ where: { orgId } });
      await tx.payRun.deleteMany({ where: { orgId } });

      // Payroll config data — order matters due to FKs
      await tx.priorPayroll.deleteMany({ where: { orgId } });
      await tx.employeeSalary.deleteMany({ where: { orgId } });
      await tx.salaryStructureComponent.deleteMany({ where: { orgId } });
      await tx.salaryStructure.deleteMany({ where: { orgId } });
      await tx.salaryComponent.deleteMany({ where: { orgId } });
      await tx.statutoryBonusConfig.deleteMany({ where: { orgId } });
      await tx.lWFConfig.deleteMany({ where: { orgId } });
      await tx.professionalTaxConfig.deleteMany({ where: { orgId } });
      await tx.eSIConfig.deleteMany({ where: { orgId } });
      await tx.ePFConfig.deleteMany({ where: { orgId } });
      await tx.paySchedule.deleteMany({ where: { orgId } });
      await tx.payrollTaxDetails.deleteMany({ where: { orgId } });

      // Strip org identifiers so orgDetails check fails
      await tx.companySettings.updateMany({
        where: { orgId },
        data: { addressLine1: null, cin: null, gstin: null },
      });

      // Reset flags
      await tx.payrollSettings.updateMany({
        where: { orgId },
        data: {
          orgDetailsCompleted: false,
          taxDetailsCompleted: false,
          payScheduleCompleted: false,
          statutoryComponentsCompleted: false,
          salaryComponentsCompleted: false,
          employeesCompleted: false,
          priorPayrollCompleted: false,
          setupCompleted: false,
          setupCompletedAt: null,
          updatedBy: userId,
        },
      });
    });

    return successResponse({ reset: true });
  } catch (e) {
    console.error("POST /payroll/setup/reset error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

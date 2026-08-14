import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { verifyPayrollResetOtp } from "@/lib/services/payroll-reset-otp";

const schema = z.object({
  otp: z.string().trim().regex(/^\d{4}$/, "Enter the 4-digit code"),
});

/**
 * Wipes payroll setup data for current tenant so checklist shows 0/7.
 * Destructive — protected by hrms.settings.write permission AND a one-time
 * OTP (issued via /request-otp) verified fresh on every call.
 */
export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const otpOk = await verifyPayrollResetOtp(orgId, parsed.data.otp);
    if (!otpOk) return validationError("Invalid or expired verification code");

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

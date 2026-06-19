import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError } from "@/lib/api-response";
import { buildAndQueuePayslipEmail } from "@/lib/services/payslip-release";
import { createAuditLog } from "@/lib/utils/audit";

/**
 * POST /api/v1/hrms/payroll/runs/:id/payslips/:payslipId/resend-email
 * Re-enqueues the payslip PDF + email job for one already-released payslip.
 * Used when SMTP was misconfigured during initial release, or employee email was added later.
 */
export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const { id, payslipId } = params as { id: string; payslipId: string };

    const payslip = await prisma.payslip.findFirst({
      where: { id: payslipId, orgId, payRunId: id, deletedAt: null },
      select: { id: true, status: true, employeeId: true },
    });
    if (!payslip) return notFound("Payslip not found");
    if (payslip.status !== "Released") {
      return validationError("Payslip must be Released before resending email");
    }

    const employee = await prisma.employee.findFirst({
      where: { id: payslip.employeeId, orgId, deletedAt: null },
      select: { workEmail: true, firstName: true, lastName: true },
    });
    if (!employee?.workEmail) {
      return validationError("Employee has no work email — add one in their profile first");
    }

    // Build the PDF + send the email inline (single payslip — no queue).
    const result = await buildAndQueuePayslipEmail({
      orgId,
      payslipId: payslip.id,
      payRunId: id,
      userId,
    });

    await createAuditLog({
      orgId, userId, action: "Update", entityType: "Payslip", entityId: payslip.id,
      changes: { action: "ResendEmail", to: employee.workEmail }, request: req,
    });

    return successResponse({ sent: result.queued, to: employee.workEmail });
  } catch (e) {
    console.error("POST /payroll/runs/[id]/payslips/[payslipId]/resend-email error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

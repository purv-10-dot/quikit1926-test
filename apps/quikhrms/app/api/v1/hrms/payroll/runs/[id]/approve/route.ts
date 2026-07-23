import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError, notFound, validationError } from "@/lib/api-response";
import { createAuditLog } from "@/lib/utils/audit";
import { buildPayrollEvent, emitPayrollEvent, PAYROLL_EVENTS } from "@/lib/events/payroll";
import { assertTransition, type PayRunStatus } from "@/lib/services/payroll-run-state";

export const POST = withAuth(async (req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const run = await prisma.payRun.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!run) return notFound();
    try {
      assertTransition(run.status as PayRunStatus, "Approved");
    } catch (err) {
      return validationError((err as Error).message);
    }

    // A run with no computed payslips must not be approvable (would release an
    // empty run to Paid).
    const payslipCount = await prisma.payslip.count({ where: { payRunId: id, orgId, deletedAt: null } });
    if (payslipCount === 0) {
      return validationError("Compute the pay run before approving — it has no payslips yet.");
    }

    const before = { status: run.status, approvedBy: run.approvedBy, approvedAt: run.approvedAt };
    const updated = await prisma.payRun.update({
      where: { id },
      data: { status: "Approved", approvedBy: userId, approvedAt: new Date(), updatedBy: userId },
    });
    const after = { status: updated.status, approvedBy: updated.approvedBy, approvedAt: updated.approvedAt };
    await createAuditLog({
      orgId, userId, action: "Approve", entityType: "PayRun", entityId: id,
      before, after, request: req,
      metadata: { totalNet: Number(updated.totalNet), employeeCount: updated.employeeCount },
    });
    emitPayrollEvent(buildPayrollEvent(PAYROLL_EVENTS.RUN_APPROVED, orgId, userId, id, {
      totalNet: Number(updated.totalNet),
      employeeCount: updated.employeeCount,
    }));
    return successResponse(updated);
  } catch (e) {
    console.error("POST /payroll/runs/[id]/approve error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

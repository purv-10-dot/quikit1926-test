import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError, notFound, validationError } from "@/lib/api-response";
import { createAuditLog } from "@/lib/utils/audit";
import { buildPayrollEvent, emitPayrollEvent, PAYROLL_EVENTS } from "@/lib/events/payroll";
import { assertTransition, type PayRunStatus } from "@/lib/services/payroll-run-state";
import { runBackground } from "@/lib/run-background";
import { runPayslipRelease } from "@/lib/jobs/run-payslip-release";
import { refreshLiabilityForPayRun } from "@/lib/services/tds-liability";

export const POST = withAuth(async (req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const run = await prisma.payRun.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!run) return notFound();
    try {
      assertTransition(run.status as PayRunStatus, "Paid");
    } catch (err) {
      return validationError((err as Error).message);
    }

    const releasedPayslipIds: string[] = [];

    await prisma.$transaction(async (tx) => {
      // Atomically claim the transition FIRST: only flip to Paid if the status
      // is still exactly what we read. A second concurrent release matches 0
      // rows and aborts — otherwise loan EMIs would be processed twice.
      const claimed = await tx.payRun.updateMany({
        where: { id, orgId, status: run.status },
        data: { status: "Paid", updatedBy: userId },
      });
      if (claimed.count === 0) {
        throw new Error("This pay run has already been released or its status changed. Refresh and try again.");
      }

      const payslips = await tx.payslip.findMany({
        where: { payRunId: id, orgId, deletedAt: null },
        include: { lines: { where: { category: "LoanDeduction" } } },
      });

      for (const ps of payslips) {
        for (const l of ps.lines) {
          if (!l.componentCode.startsWith("LOAN_")) continue;
          const loanIdFragment = l.componentCode.replace("LOAN_", "");
          const loan = await tx.employeeLoan.findFirst({
            where: { orgId, deletedAt: null, status: "Disbursed", id: { endsWith: loanIdFragment }, employeeId: ps.employeeId },
          });
          if (!loan) continue;
          const amount = Number(l.amount);
          const newOutstanding = Math.max(0, Number(loan.outstandingAmount) - amount);
          const newEmisPaid = loan.emisPaid + 1;
          await tx.loanRepayment.create({
            data: {
              orgId,
              loanId: loan.id,
              payRunId: id,
              payslipId: ps.id,
              amount,
              repaidOn: run.payDate,
              emiNumber: newEmisPaid,
            },
          });
          await tx.employeeLoan.update({
            where: { id: loan.id },
            data: {
              outstandingAmount: newOutstanding,
              emisPaid: newEmisPaid,
              ...(newOutstanding <= 0 ? { status: "Closed", closedAt: new Date() } : {}),
              updatedBy: userId,
            },
          });
        }
      }

      await tx.payslip.updateMany({
        where: { payRunId: id, orgId, deletedAt: null },
        data: { status: "Released", releasedAt: new Date(), updatedBy: userId },
      });
      // (Run status already flipped to Paid atomically at the top of the tx.)

      const released = await tx.payslip.findMany({
        where: { payRunId: id, orgId, deletedAt: null, status: "Released" },
        select: { id: true },
      });
      releasedPayslipIds.push(...released.map((p) => p.id));
    });

    await createAuditLog({
      orgId, userId, action: "StatusChange", entityType: "PayRun", entityId: id,
      changes: { from: run.status, to: "Paid" }, request: req,
      metadata: { payDate: run.payDate, totalNet: Number(run.totalNet) },
    });
    emitPayrollEvent(buildPayrollEvent(PAYROLL_EVENTS.RUN_RELEASED, orgId, userId, id, { payDate: run.payDate }));

    // Build per-payslip PDFs + send emails in-process (no queue). Runs in the
    // background so releasing many payslips doesn't block the response.
    if (releasedPayslipIds.length > 0) {
      runBackground(`payslip-release:${id}`, () =>
        runPayslipRelease({ orgId, userId, payslipIds: releasedPayslipIds, payRunId: id }),
      );
    }

    // Refresh the TDS liability period that this pay run feeds into. Errors
    // here must not fail the release — log and move on. Admins can always hit
    // POST /api/v1/hrms/payroll/tds/liability/recompute manually.
    await refreshLiabilityForPayRun(orgId, id).catch((err) => {
      console.error("[tds-liability] refresh after release failed:", err);
    });

    return successResponse({ id, status: "Paid", queuedPayslips: releasedPayslipIds.length });
  } catch (e) {
    console.error("POST /payroll/runs/[id]/release error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

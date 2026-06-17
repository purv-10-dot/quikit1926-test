import { prisma } from "@/lib/prisma";
import {
  computePayslipsForRun,
  persistComputedPayslips,
} from "@/lib/services/payroll-compute";
import { setPayrollComputeState } from "@/lib/services/payroll-compute-state";
import { createAuditLog } from "@/lib/utils/audit";
import { buildPayrollEvent, emitPayrollEvent, PAYROLL_EVENTS } from "@/lib/events/payroll";

export interface PayrollComputeArgs {
  orgId: string;
  userId: string;
  runId: string;
}

/**
 * In-process payroll compute (was the BullMQ worker processor). Runs via
 * runBackground() from the compute route; writes status to the PayRun's
 * compute* columns (the UI polls GET .../compute/status). No queue, no realtime.
 */
export async function runPayrollCompute(args: PayrollComputeArgs): Promise<void> {
  const { orgId, userId, runId } = args;

  const run = await prisma.payRun.findFirst({ where: { id: runId, orgId, deletedAt: null } });
  if (!run) throw new Error(`PayRun ${runId} not found`);
  if (run.status !== "Draft" && run.status !== "Processing") {
    throw new Error(`Cannot compute a ${run.status} pay run`);
  }

  await setPayrollComputeState(orgId, runId, {
    status: "running",
    runId,
    orgId,
    startedAt: new Date().toISOString(),
  });

  const result = await computePayslipsForRun(orgId, runId);
  await persistComputedPayslips(orgId, runId, result, userId);

  await createAuditLog({
    orgId,
    userId,
    action: "Update",
    entityType: "PayRun",
    entityId: runId,
    changes: {
      action: "compute",
      employeeCount: result.payslips.length,
      totalNet: result.totalNet,
    },
  });

  emitPayrollEvent(
    buildPayrollEvent(PAYROLL_EVENTS.RUN_PROCESSED, orgId, userId, runId, {
      employeeCount: result.payslips.length,
      totalGross: result.totalGross,
      totalNet: result.totalNet,
      totalDeductions: result.totalDeductions,
    }),
  );

  await setPayrollComputeState(orgId, runId, {
    status: "done",
    finishedAt: new Date().toISOString(),
    employeeCount: result.payslips.length,
    totalGross: Number(result.totalGross),
    totalNet: Number(result.totalNet),
    totalDeductions: Number(result.totalDeductions),
  });
}

/** Mark compute failed (used as runBackground onError). */
export async function markPayrollComputeFailed(
  orgId: string,
  runId: string,
  err: unknown,
): Promise<void> {
  const msg = err instanceof Error ? err.message : "Unknown error";
  await setPayrollComputeState(orgId, runId, {
    status: "failed",
    finishedAt: new Date().toISOString(),
    error: msg,
  }).catch(() => {});
}

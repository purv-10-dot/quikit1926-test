import { buildAndQueuePayslipEmail } from "@/lib/services/payslip-release";
import { buildPayrollEvent, emitPayrollEvent, PAYROLL_EVENTS } from "@/lib/events/payroll";

/**
 * In-process payslip release (was the BullMQ pdf-generation processor): builds
 * each payslip PDF and sends its email inline. Runs via runBackground() from the
 * release route so a large batch never blocks the request. No queue.
 */
export async function runPayslipRelease(args: {
  orgId: string;
  userId?: string;
  payslipIds: string[];
  payRunId: string;
}): Promise<void> {
  const { orgId, userId, payslipIds, payRunId } = args;
  for (const payslipId of payslipIds) {
    try {
      const result = await buildAndQueuePayslipEmail({ orgId, payslipId, payRunId, userId });
      if (!result.queued) {
        emitPayrollEvent(
          buildPayrollEvent(PAYROLL_EVENTS.PAYSLIP_EMAIL_FAILED, orgId, userId ?? "", payslipId, {
            reason: result.reason,
          }),
        );
        console.warn(`[payslip-release] skipped payslip=${payslipId} reason=${result.reason}`);
      }
    } catch (err) {
      console.error(`[payslip-release] payslip=${payslipId} failed:`, err);
      emitPayrollEvent(
        buildPayrollEvent(PAYROLL_EVENTS.PAYSLIP_EMAIL_FAILED, orgId, userId ?? "", payslipId, {
          reason: err instanceof Error ? err.message : "error",
        }),
      );
    }
  }
}

export const PAYROLL_EVENTS = {
  SETUP_COMPLETED: "hrms.payroll.setup.completed",
  SALARY_ASSIGNED: "hrms.payroll.salary.assigned",
  SALARY_REVISED: "hrms.payroll.salary.revised",
  REVISION_REQUESTED: "hrms.payroll.revision.requested",
  REVISION_APPROVED: "hrms.payroll.revision.approved",
  REVISION_REJECTED: "hrms.payroll.revision.rejected",
  RUN_CREATED: "hrms.payroll.run.created",
  RUN_PROCESSED: "hrms.payroll.run.processed",
  RUN_APPROVED: "hrms.payroll.run.approved",
  RUN_RELEASED: "hrms.payroll.run.released",
  PAYSLIP_RELEASED: "hrms.payroll.payslip.released",
  PAYSLIP_EMAIL_SENT: "hrms.payroll.payslip.email.sent",
  PAYSLIP_EMAIL_FAILED: "hrms.payroll.payslip.email.failed",
} as const;

export type PayrollEvent = typeof PAYROLL_EVENTS[keyof typeof PAYROLL_EVENTS];

export interface PayrollEventPayload {
  event: PayrollEvent;
  orgId: string;
  userId: string;
  entityId?: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

export function buildPayrollEvent(
  event: PayrollEvent,
  orgId: string,
  userId: string,
  entityId?: string,
  data?: Record<string, unknown>,
): PayrollEventPayload {
  return { event, orgId, userId, entityId, data, timestamp: new Date().toISOString() };
}

/**
 * Log event + dispatch to notification handler.
 */
export function emitPayrollEvent(payload: PayrollEventPayload): void {
  console.log(`[payroll-event] ${payload.event}`, JSON.stringify(payload));
  // Lazy import to avoid circular deps
  void import("@/lib/services/payroll-notifications").then((m) =>
    m.handlePayrollEvent(payload).catch((e) => console.error("[payroll-event] handler failed", e)),
  );
}

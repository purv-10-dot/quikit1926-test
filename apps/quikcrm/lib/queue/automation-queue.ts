/**
 * Automation queue — BullMQ/Redis has been removed.
 *
 * The queue backend is disabled: `enqueueAutomation` is a no-op. Automation is
 * triggered only from paths guarded by `isRedisEnabled()` / `requireRedisOr503()`
 * (which now report disabled), so this is never reached on the happy path. Types
 * are kept so callers and tests need no changes.
 */

/** Minimal replacement for BullMQ's JobsOptions (only the fields callers pass). */
export interface AutomationEnqueueOptions {
  jobId?: string;
  delay?: number;
}

export interface AutomationJobData {
  orgId: string;
  workflowId: string;
  leadId: string;
  startNodeId: string;
  /** Provided when a wait-resume creates a child job, so the audit row can be tied back. */
  pendingStepId?: string;
  /** Step index for cycle detection across BullMQ-spanned executions. */
  step?: number;
}

const QUEUE_NAME = "automation";

/**
 * No-op. Background automation processing is disabled (no BullMQ/Redis). Returns
 * a synthetic job id so callers that persist it keep working; nothing is
 * actually queued or run.
 */
export async function enqueueAutomation(
  data: AutomationJobData,
  opts: AutomationEnqueueOptions = {},
): Promise<string> {
  return (
    opts.jobId ??
    `${data.workflowId}:${data.leadId}:${data.startNodeId}:${data.step ?? 0}`
  );
}

export const AUTOMATION_QUEUE_NAME = QUEUE_NAME;

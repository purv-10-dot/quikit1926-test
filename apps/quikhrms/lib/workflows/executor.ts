/**
 * Workflow engine REMOVED (2026-06-04).
 *
 * The WorkflowRule / WorkflowExecution tables, the rules engine, conditions /
 * actions modules, the admin UI (settings/workflows) and the API routes
 * (api/v1/hrms/workflows) were all deleted. This file is intentionally kept as
 * a no-op so the ~37 domain routes that still call `fireWorkflow(...)` (leave,
 * expense, attendance, recruit, onboarding, …) keep compiling and running
 * harmlessly. To fully strip the feature, remove those `fireWorkflow(...)`
 * call-sites and delete this file.
 */
export interface WorkflowContext {
  orgId: string;
  event: string;
  payload: Record<string, unknown>;
}

/** No-op — the workflow automation engine has been removed. */
export async function fireWorkflow(_ctx: WorkflowContext): Promise<void> {
  // intentionally does nothing
}

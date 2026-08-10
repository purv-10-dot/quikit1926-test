/**
 * Route-facing guard: given an issue's project, type, current status and the
 * requested target status, enforce the active workflow. This is the single
 * choke point wired into move / bulk-status / PATCH.
 *
 * Behaviour:
 *   - No published scheme for the project  → no-op (legacy any→any).
 *   - Target === current                   → no-op (reorder / same column).
 *   - Move not on the graph                → throws TransitionNotAllowedError.
 *
 * See apps/quiktrack/WORKFLOW_INTEGRATION_PLAN.md §6.
 */
import { assertTransitionAllowed } from "./graph";
import { resolveWorkflowGraph } from "./resolve-workflow";

export async function assertTransitionForIssue(params: {
  projectId: string;
  issueType: string;
  fromStatusId: string | null;
  toStatusId: string;
}): Promise<void> {
  const { projectId, issueType, fromStatusId, toStatusId } = params;
  if (fromStatusId === toStatusId) return;

  const graph = await resolveWorkflowGraph(projectId, issueType);
  if (!graph) return; // opt-in: no published workflow → today's behaviour.

  assertTransitionAllowed(graph, fromStatusId, toStatusId);
}

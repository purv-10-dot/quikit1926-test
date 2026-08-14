/**
 * Resolve the ACTIVE workflow that governs a given issue, and load its graph.
 *
 * Resolution order (Phase 1, classic):
 *   project → its workflow scheme → item matching the issue's TYPE NAME
 *           → else the scheme's default item (issueTypeId NULL, isDefault).
 *
 * `QtIssue.type` is a free string whose values are issue-type *names* (see
 * lib/services/projectDefaults DEFAULT_ISSUE_TYPES), so we map type→workflow by
 * matching QtWorkflowSchemeItem → QtIssueType.name. No typeId FK in Phase 1.
 *
 * Returns null when the project has NO scheme, or the resolved workflow is not
 * published (isActive=false). A null result means "no gating" — callers fall
 * back to today's any→any behaviour (opt-in enforcement).
 *
 * See apps/quiktrack/WORKFLOW_INTEGRATION_PLAN.md §6.
 */
import { db } from "@/lib/db";
import type { GraphRule, GraphTransition, WorkflowGraph } from "./types";
import type { TransitionType } from "./types";

/**
 * @param projectId  the issue's project
 * @param issueType  QtIssue.type (an issue-type NAME, e.g. "Bug")
 */
export async function resolveWorkflowGraph(
  projectId: string,
  issueType: string,
): Promise<WorkflowGraph | null> {
  const scheme = await db.qtWorkflowScheme.findUnique({
    where: { projectId },
    select: {
      items: {
        select: {
          isDefault: true,
          workflowId: true,
          issueType: { select: { name: true } },
        },
      },
    },
  });
  if (!scheme) return null;

  // Prefer the item whose issue-type name matches; else the default item.
  const byType = scheme.items.find((i) => i.issueType?.name === issueType);
  const fallback = scheme.items.find((i) => i.isDefault);
  const chosen = byType ?? fallback;
  if (!chosen) return null;

  return loadWorkflowGraph(chosen.workflowId);
}

/**
 * Load a workflow's transitions into a flat WorkflowGraph. Returns null if the
 * workflow is missing, soft-deleted, or not published (isActive=false).
 * Soft-deleted transitions are excluded.
 */
export async function loadWorkflowGraph(
  workflowId: string,
): Promise<WorkflowGraph | null> {
  const wf = await db.qtWorkflow.findFirst({
    where: { id: workflowId, isDeleted: false },
    select: {
      id: true,
      isActive: true,
      transitions: {
        where: { isDeleted: false },
        orderBy: { orderIndex: "asc" },
        select: {
          id: true,
          name: true,
          type: true,
          toStatusId: true,
          fromStatuses: { select: { statusId: true } },
          rules: {
            select: {
              id: true,
              kind: true,
              type: true,
              config: true,
              errorMessage: true,
              groupNo: true,
              orderNo: true,
            },
          },
        },
      },
    },
  });
  if (!wf || !wf.isActive) return null;

  const transitions: GraphTransition[] = wf.transitions.map((t) => ({
    id: t.id,
    name: t.name,
    type: t.type as TransitionType,
    toStatusId: t.toStatusId,
    fromStatusIds: t.fromStatuses.map((f) => f.statusId),
    rules: t.rules.map(
      (r): GraphRule => ({
        id: r.id,
        kind: r.kind as GraphRule["kind"],
        type: r.type,
        config: (r.config as Record<string, unknown>) ?? {},
        errorMessage: r.errorMessage,
        groupNo: r.groupNo,
        orderNo: r.orderNo,
      }),
    ),
  }));

  return { id: wf.id, isActive: wf.isActive, transitions };
}

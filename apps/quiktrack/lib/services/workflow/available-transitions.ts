/**
 * Route-facing helper for GET /api/issues/[id]/transitions. Resolves the issue's
 * active workflow, lists the legal target statuses from the current status, and
 * (Phase 3) drops any transition whose CONDITIONS fail for the acting user —
 * conditions gate availability silently, so a blocked transition simply isn't
 * offered.
 *
 * When the project has no published workflow, `gated` is false and `transitions`
 * is empty — the client keeps offering every status (today's behaviour).
 *
 * See apps/quiktrack/WORKFLOW_INTEGRATION_PLAN.md §2, §6.
 */
import { db } from "@/lib/db";
import { userCanInProject } from "@/lib/api/permissions";
import { isTransitionAvailableFrom } from "./graph";
import { resolveWorkflowGraph } from "./resolve-workflow";
import { evaluateConditions } from "./rules/engine";
import type { AvailableTransition } from "./types";
import type { RuleContext, RuleIssueSnapshot, RuleSpec } from "./rules/context";

export interface AvailableTransitionsResult {
  gated: boolean;
  transitions: AvailableTransition[];
}

export async function listAvailableTransitionsForIssue(params: {
  issue: RuleIssueSnapshot;
  userId: string;
}): Promise<AvailableTransitionsResult> {
  const { issue, userId } = params;
  const graph = await resolveWorkflowGraph(issue.projectId, issue.type);
  if (!graph) return { gated: false, transitions: [] };

  const prim = {
    userCanInProject: (resource: string, action: string) =>
      userCanInProject(userId, issue.orgId, issue.projectId, resource as never, action as never),
    userInProjectRole: async (roleName: string) => {
      const a = await db.qtProjectUserRole.findUnique({
        where: { projectId_userId: { projectId: issue.projectId, userId } },
        select: { projectRole: { select: { name: true } } },
      });
      return a?.projectRole.name === roleName;
    },
    subtaskStatusIds: async () => {
      const kids = await db.qtIssue.findMany({
        where: { parentId: issue.id, isDeleted: false },
        select: { statusId: true },
      });
      return kids.map((k) => k.statusId);
    },
    transitionHistory: async () => {
      const rows = await db.qtIssueTransitionLog.findMany({
        where: { issueId: issue.id },
        orderBy: { createdAt: "asc" },
        select: { fromStatusId: true, toStatusId: true, actorId: true },
      });
      return rows;
    },
    parentStatusId: async () => {
      if (!issue.id) return null;
      const self = await db.qtIssue.findUnique({
        where: { id: issue.id },
        select: { parent: { select: { statusId: true } } },
      });
      return self?.parent?.statusId ?? null;
    },
  };

  const out: AvailableTransition[] = [];
  const seen = new Set<string>();
  for (const t of graph.transitions) {
    if (!isTransitionAvailableFrom(t, issue.statusId)) continue;
    const conditions: RuleSpec[] = t.rules
      .filter((r) => r.kind === "CONDITION")
      .map((r) => ({
        id: r.id,
        type: r.type,
        config: r.config,
        errorMessage: r.errorMessage,
        groupNo: r.groupNo,
        orderNo: r.orderNo,
      }));
    if (conditions.length > 0) {
      const ctx: RuleContext = {
        userId,
        issue,
        toStatusId: t.toStatusId,
        toStatusCategory: "",
        inputs: {},
        prim,
      };
      if (!(await evaluateConditions(ctx, conditions))) continue;
    }
    if (seen.has(t.toStatusId)) continue;
    seen.add(t.toStatusId);
    out.push({ id: t.id, name: t.name, toStatusId: t.toStatusId });
  }
  return { gated: true, transitions: out };
}

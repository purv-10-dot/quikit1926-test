/**
 * Auto-fire workflow transitions from a dev event (GitHub PR/branch/commit).
 *
 * For each linked issue: resolve its active workflow, find a transition that
 * (a) carries the given trigger event AND (b) is available from the issue's
 * current status, then run it through executeTransition (conditions/validators
 * are honoured — a blocked auto-move is silently skipped, never forced).
 *
 * Runs from the webhook (no user session), so moves are attributed to a system
 * actor and marked as API-driven.
 */
import { db } from "@/lib/db";
import { resolveWorkflowGraph } from "./resolve-workflow";
import { isTransitionAvailableFrom } from "./graph";
import { executeTransition, ConditionsFailedError, ValidationFailedError } from "./execute-transition";
import type { TriggerEvent } from "./triggers";

const SYSTEM_ACTOR = "github-automation";

/** Fire any transition whose trigger matches `event` for each issue. */
export async function fireTriggerForIssues(
  orgId: string,
  issueIds: string[],
  event: TriggerEvent,
): Promise<number> {
  let moved = 0;
  for (const issueId of issueIds) {
    try {
      if (await fireTriggerForIssue(orgId, issueId, event)) moved++;
    } catch {
      // Never let an auto-move failure break webhook ingestion.
    }
  }
  return moved;
}

async function fireTriggerForIssue(orgId: string, issueId: string, event: TriggerEvent): Promise<boolean> {
  const issue = await db.qtIssue.findFirst({
    where: { id: issueId, orgId, isDeleted: false },
    select: {
      id: true, orgId: true, projectId: true, type: true, statusId: true,
      assigneeId: true, resolutionId: true, priority: true, reporterId: true,
      title: true, description: true, storyPoints: true, eta: true, dueDate: true, startDate: true,
    },
  });
  if (!issue) return false;

  const graph = await resolveWorkflowGraph(issue.projectId, issue.type ?? "TASK");
  if (!graph) return false;

  // Transitions carrying this trigger event, available from the current status.
  const withTrigger = await db.qtWorkflowTrigger.findMany({
    where: { event, transition: { workflowId: graph.id } },
    select: { transitionId: true },
  });
  const triggeredIds = new Set(withTrigger.map((t) => t.transitionId));
  const target = graph.transitions.find(
    (t) => triggeredIds.has(t.id) && isTransitionAvailableFrom(t, issue.statusId),
  );
  if (!target || target.toStatusId === issue.statusId) return false;

  try {
    const res = await executeTransition({
      issue: {
        id: issue.id, orgId: issue.orgId, projectId: issue.projectId, type: issue.type ?? "TASK",
        statusId: issue.statusId, assigneeId: issue.assigneeId ?? null,
        resolutionId: issue.resolutionId ?? null, priority: issue.priority ?? null,
        reporterId: issue.reporterId ?? null, title: issue.title ?? null,
        description: issue.description ?? null, storyPoints: issue.storyPoints ?? null,
        eta: issue.eta ?? null,
        dueDate: issue.dueDate ? issue.dueDate.toISOString() : null,
        startDate: issue.startDate ? issue.startDate.toISOString() : null,
      },
      toStatusId: target.toStatusId,
      userId: SYSTEM_ACTOR,
    });
    // Apply the status change + any post-function patch + audit log in one txn.
    const { postFunctionPatchToPrisma } = await import("./execute-transition");
    await db.$transaction(async (tx) => {
      await tx.qtIssue.update({
        where: { id: issue.id },
        data: { statusId: target.toStatusId, ...postFunctionPatchToPrisma(res.patch), updatedBy: SYSTEM_ACTOR },
      });
      await tx.qtIssueTransitionLog.create({
        data: {
          orgId, issueId: issue.id, transitionId: res.transitionId,
          fromStatusId: issue.statusId, toStatusId: target.toStatusId,
          actorId: SYSTEM_ACTOR, reason: `trigger:${event}`,
          actorType: "agent", actingAgentId: SYSTEM_ACTOR,
        },
      });
    });
    return true;
  } catch (e) {
    if (e instanceof ConditionsFailedError || e instanceof ValidationFailedError) return false;
    throw e;
  }
}

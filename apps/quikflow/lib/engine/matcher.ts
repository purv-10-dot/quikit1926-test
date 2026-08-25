import { db } from "@/lib/db";
import type { EngineEvent } from "./types";

/**
 * Find the Live workflows that should react to an event, scoped to the event's
 * org (tenant isolation is enforced here — no query ever crosses orgId).
 *
 * A workflow matches when: same org, status Active, and its trigger JSON's
 * `app` + `event` equal the incoming event. The trigger shape authored by the
 * builder is `{ type, app, event, label }`.
 */
export async function matchWorkflows(event: EngineEvent) {
  const rows = await db.wfWorkflow.findMany({
    where: { orgId: event.orgId, status: "Active", deletedAt: null },
    select: { id: true, name: true, trigger: true, graphNodes: true, graphEdges: true },
  });

  return rows.filter((wf) => {
    const trigger = (wf.trigger ?? {}) as Record<string, unknown>;
    return trigger.app === event.app && trigger.event === event.event;
  });
}

/**
 * Targeted match for scheduler-produced `schedule.tick` events: the scheduler
 * already knows exactly which workflow is due (via `data.workflowId`), so we
 * run just that one instead of matching every schedule.tick workflow.
 */
export async function matchScheduledWorkflow(event: EngineEvent) {
  const id = event.data?.workflowId;
  if (typeof id !== "string") return [];
  const wf = await db.wfWorkflow.findFirst({
    where: { id, orgId: event.orgId, status: "Active", deletedAt: null },
    select: { id: true, name: true, trigger: true, graphNodes: true, graphEdges: true },
  });
  return wf ? [wf] : [];
}

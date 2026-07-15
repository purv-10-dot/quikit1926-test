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
    where: { orgId: event.orgId, status: "Active" },
    select: { id: true, name: true, trigger: true, graphNodes: true, graphEdges: true },
  });

  return rows.filter((wf) => {
    const trigger = (wf.trigger ?? {}) as Record<string, unknown>;
    return trigger.app === event.app && trigger.event === event.event;
  });
}

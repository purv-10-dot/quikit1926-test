/**
 * Workflow trigger entry points.
 * Called from leads route handlers (and elsewhere) after a state-change event.
 *
 * Skips silently when Redis is disabled — automations require BullMQ.
 */

import { prisma } from "@/lib/db/prisma";
import { isRedisEnabled } from "@/lib/db/redis";
import type { WorkflowEdge, WorkflowNode } from "@/types/workflow";

let warnedDisabled = false;

async function fireTrigger(orgId: string, leadId: string, triggerType: string) {
  if (!isRedisEnabled()) {
    if (!warnedDisabled) {
      warnedDisabled = true;
      console.info("[automation] Redis is disabled — workflow triggers will not fire. Set REDIS_URL to enable.");
    }
    return;
  }
  // Lazy-import the queue module so the BullMQ side-effects don't run when Redis is off.
  const { enqueueAutomation } = await import("@/lib/queue/automation-queue");

  const workflows = await prisma.crmWorkflowDefinition.findMany({
    where: { orgId, status: "Active", triggerType },
  });
  for (const wf of workflows) {
    const nodes = (wf.graphNodes as unknown as WorkflowNode[]) ?? [];
    const edges = (wf.graphEdges as unknown as WorkflowEdge[]) ?? [];
    const trigger = nodes.find((n) => n.kind === triggerType);
    if (!trigger) continue;
    const firstAction = edges.find((e) => e.from === trigger.id)?.to;
    if (!firstAction) continue;
    await enqueueAutomation(
      {
        orgId,
        workflowId: wf.id,
        leadId,
        startNodeId: firstAction,
        step: 0,
      },
      { jobId: `${wf.id}:${leadId}:trigger` },
    );
  }
}

export async function onLeadCreated(orgId: string, leadId: string, _ownerName: string): Promise<void> {
  await fireTrigger(orgId, leadId, "trigger_lead_created");
}

export async function onLeadUpdated(orgId: string, leadId: string): Promise<void> {
  await fireTrigger(orgId, leadId, "trigger_lead_updated");
}

/**
 * Workflow trigger entry points.
 * Called from leads route handlers (and elsewhere) after a state-change event.
 *
 * Skips silently when Redis is disabled — automations require BullMQ.
 */

import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { isRedisEnabled } from "@/lib/db/redis";
import { snapshotOf } from "@/lib/services/automation/attribution";
import { ADMIT_NEW_STATUS } from "@/lib/services/automation/lifecycle";
import type { WorkflowEdge, WorkflowNode } from "@/types/workflow";

let warnedDisabled = false;

async function fireTrigger(tenantId: string, leadId: string, triggerType: string) {
  if (!isRedisEnabled()) {
    if (!warnedDisabled) {
      warnedDisabled = true;
      console.info("[automation] Redis is disabled — workflow triggers will not fire. Set REDIS_URL to enable.");
    }
    return;
  }
  // Lazy-import the queue module so the BullMQ side-effects don't run when Redis is off.
  const { enqueueAutomation } = await import("@/lib/queue/automation-queue");

  // Admit-new gate (SPEC §7 / S1): a NEW lead-change event only enters an
  // Active automation. Draining/Stopped/Deleted/Draft never admit new leads
  // (Draining still *resumes* its in-flight leads — that gate is in runFrom).
  // ADMIT_NEW_STATUS is the single source of truth shared with the engine.
  const workflows = await prisma.qcfWorkflowDefinition.findMany({
    where: { tenantId, status: ADMIT_NEW_STATUS, deletedAt: null, triggerType },
  });
  if (workflows.length === 0) return;

  // One trigger event id per lead-change event; capture the trigger-time field
  // snapshot ONCE and carry it on every enqueued run so attribution (SPEC §8)
  // can show "field was X at trigger". Shared across all matching workflows.
  const eventId = randomUUID();
  const lead = await prisma.qcfLead.findFirst({ where: { id: leadId, tenantId } });
  const triggerSnapshot = lead ? snapshotOf(lead) : undefined;

  for (const wf of workflows) {
    const nodes = (wf.graphNodes as unknown as WorkflowNode[]) ?? [];
    const edges = (wf.graphEdges as unknown as WorkflowEdge[]) ?? [];
    const trigger = nodes.find((n) => n.kind === triggerType);
    if (!trigger) continue;
    const firstAction = edges.find((e) => e.from === trigger.id)?.to;
    if (!firstAction) continue;
    await enqueueAutomation(
      {
        tenantId,
        workflowId: wf.id,
        leadId,
        startNodeId: firstAction,
        step: 0,
        triggerEventId: eventId,
        triggerType,
        triggerSnapshot,
      },
      { jobId: `${wf.id}:${leadId}:${eventId}` },
    );
  }
  // NOTE on jobId: it is UNIQUE PER EVENT (eventId is fresh per fireTrigger call),
  // NOT a static `${wf}:${leadId}:trigger`. The static form deduplicated on
  // BullMQ's job id: a retained completed job OR a stuck failed/retrying job
  // (exponential backoff, 60s+) with that id would BLOCK every subsequent
  // lead-update for the same lead from enqueuing — so a rule fired only once per
  // lead, or fired late (whenever the stale job's next retry came round). A fresh
  // lead had no collision and fired instantly; a re-tested lead appeared broken.
  // Unique-per-event = every lead update is its own job: fires immediately, every
  // time, and a failed run can't gum up future events for that lead.
}

export async function onLeadCreated(tenantId: string, leadId: string, _ownerName: string): Promise<void> {
  await fireTrigger(tenantId, leadId, "trigger_lead_created");
}

export async function onLeadUpdated(tenantId: string, leadId: string): Promise<void> {
  await fireTrigger(tenantId, leadId, "trigger_lead_updated");
}

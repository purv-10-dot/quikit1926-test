/**
 * Workflow execution engine — port of quikcrm-backend/src/platform/automation-engine.service.ts.
 *
 * Behavioral changes from the original:
 *   - Pending steps are stored as BullMQ delayed jobs instead of polled DB rows.
 *     The Postgres `AutomationPendingStep` row is still created (for audit/admin
 *     visibility), but BullMQ owns the firing.
 *   - `runFrom()` walks the graph synchronously until it hits a `wait` node, at
 *     which point it enqueues a delayed continuation job and exits.
 *
 * Behavioral preservation:
 *   - 48-step execution limit per logical workflow run.
 *   - Same node kinds: trigger_lead_*, create_task, wait, if_else,
 *     distribute_lead, notify_user, send_email.
 *   - if_else branch traversal via edge.branch === "true" | "false".
 *   - Round-robin distribute via AutomationDistributionState.
 *   - Errors in individual node execution don't propagate — they fail the
 *     pending step row and let BullMQ retry the job.
 */

import { prisma } from "@/lib/db/prisma";
import type { QcfLead as Lead } from "@prisma/client";
import { enqueueAutomation, type AutomationJobData } from "@/lib/queue/automation-queue";
import { randomUUID } from "crypto";
import { pickNextUser, resolveAssignment } from "@/lib/services/automation/distribution";
import { snapshotOf, type TriggerContext } from "@/lib/services/automation/attribution";
import { canResumeInFlight } from "@/lib/services/automation/lifecycle";
import { applyAutomatedLeadWrite, AUTOMATION_ACTOR_ID } from "@/lib/services/automation/automated-write";
import { executeSendEmail } from "@/lib/services/automation/email-action";
import { evalCondition, evalIfElse } from "@/lib/services/automation/conditions";
import type {
  DistributeConfig,
  IfElseConfig,
  WorkflowEdge,
  WorkflowGraph,
  WorkflowNode,
} from "@/types/workflow";

const MAX_STEPS = 48;

// The automation actor id + the automated-write contract live in
// automated-write.ts (S2). Re-exported here for back-compat with existing
// importers/tests that reference it from the engine module.
export { AUTOMATION_ACTOR_ID };

interface RunContext {
  orgId: string;
  workflowId: string;
  leadId: string;
  graph: WorkflowGraph;
  step: number;
  /** Attribution (SPEC §8): correlation id + trigger type + trigger-time snapshot. */
  triggerEventId: string;
  triggerType: string | null;
  snapshot: Record<string, unknown>;
}

/** Entry point — kick off a workflow from a given node id. */
export async function runFrom(
  orgId: string,
  workflowId: string,
  leadId: string,
  startNodeId: string,
  startStep = 0,
  triggerCtx?: TriggerContext,
): Promise<void> {
  // Firing gate (SPEC §7 / S1): a run may proceed while the automation is
  // Active OR Draining — a Drain lets already-entered (in-flight) leads finish,
  // it just admits no NEW leads (that gate lives in the trigger emitter). A
  // Stopped/Deleted/Draft/Paused/Archived automation never runs. Soft-deleted
  // rows (deletedAt set) are excluded here since QcfWorkflowDefinition is not in
  // the shared soft-delete middleware set.
  const wf = await prisma.qcfWorkflowDefinition.findFirst({
    where: { id: workflowId, orgId, deletedAt: null },
  });
  if (!wf || !canResumeInFlight(wf.status)) return;

  const graph: WorkflowGraph = {
    nodes: (wf.graphNodes as unknown as WorkflowNode[]) ?? [],
    edges: (wf.graphEdges as unknown as WorkflowEdge[]) ?? [],
  };
  const lead = await prisma.qcfLead.findFirst({ where: { id: leadId, orgId } });
  if (!lead) return;

  // Trigger-time attribution context. Prefer values threaded from the emit site
  // (Task 2.3); otherwise capture a run-start snapshot and mint an event id.
  // In v1 there is no Wait between trigger and condition, so run-start == trigger
  // time for R1-R21 — the snapshot faithfully records "field was X at trigger".
  const triggerEventId = triggerCtx?.eventId ?? randomUUID();
  const triggerType = triggerCtx?.type ?? (wf.triggerType ?? null);
  const snapshot = triggerCtx?.snapshot ?? snapshotOf(lead);

  let nodeId: string | null = startNodeId;
  let step = startStep;
  while (nodeId && step < MAX_STEPS) {
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) break;
    const ctx: RunContext = { orgId, workflowId, leadId, graph, step, triggerEventId, triggerType, snapshot };
    const result = await executeNode(node, lead, ctx);
    if (result.kind === "wait") return; // execution suspended; resume job will continue
    nodeId = result.nextNodeId;
    step += 1;
  }
}

interface NodeResultContinue {
  kind: "continue";
  nextNodeId: string | null;
}
interface NodeResultWait {
  kind: "wait";
}
type NodeResult = NodeResultContinue | NodeResultWait;

async function executeNode(node: WorkflowNode, lead: Lead, ctx: RunContext): Promise<NodeResult> {
  try {
    switch (node.kind) {
      case "trigger_lead_created":
      case "trigger_lead_updated":
        return { kind: "continue", nextNodeId: pickNext(ctx.graph, node.id) };

      case "create_task": {
        const cfg = node.config as { subject?: string; assignTo?: string; priority?: string };
        const subject = String(cfg.subject || "Workflow task");
        const assignedToUserId = cfg.assignTo === "ownerId" ? lead.ownerId : (cfg.assignTo ?? null);
        const priority = (cfg.priority as "Low" | "Medium" | "High" | undefined) || "Medium";
        await prisma.qcfTask.create({
          data: {
            orgId: ctx.orgId,
            subject,
            priority,
            status: "Open",
            assignedToUserId,
            leadId: lead.id,
            relatedKind: "lead",
            relatedObjectId: lead.id,
          },
        });
        return { kind: "continue", nextNodeId: pickNext(ctx.graph, node.id) };
      }

      case "update_lead_field": {
        // Sets exactly one lead field to a specified value — the action in every
        // R1–R21 rule. Delegates the entire 1.3 write contract (change-
        // conditional / loop guard / stage→transition, status→PATCH / attribution
        // / in-memory update) to the shared helper (S2), so there is exactly one
        // implementation of that contract. SPEC §5.3.
        const cfg = node.config as { field?: string; value?: string | null };
        const field = cfg.field;
        if (!field) return { kind: "continue", nextNodeId: pickNext(ctx.graph, node.id) };

        const outcome = await applyAutomatedLeadWrite({
          orgId: ctx.orgId,
          lead,
          field,
          value: cfg.value ?? null,
          workflowId: ctx.workflowId,
          nodeId: node.id,
          triggerEventId: ctx.triggerEventId,
          triggerType: ctx.triggerType,
          snapshot: ctx.snapshot,
        });
        // A terminated run (loop cap hit) stops here; otherwise continue.
        if (outcome === "terminated") return { kind: "continue", nextNodeId: null };
        return { kind: "continue", nextNodeId: pickNext(ctx.graph, node.id) };
      }

      case "wait": {
        const cfg = node.config as { durationMinutes?: number };
        const minutes = Math.max(1, Number(cfg.durationMinutes ?? 60));
        const resumeAt = new Date(Date.now() + minutes * 60_000);
        const next = pickNext(ctx.graph, node.id);
        if (!next) return { kind: "continue", nextNodeId: null };
        // Audit row in Postgres
        const pending = await prisma.qcfAutomationPendingStep.create({
          data: {
            orgId: ctx.orgId,
            workflowId: ctx.workflowId,
            leadId: lead.id,
            resumeNodeId: next,
            resumeAt,
            status: "pending",
            ownerSnapshot: lead.ownerName,
          },
        });
        // BullMQ delayed job — fires precisely at resumeAt with exponential retry
        const data: AutomationJobData = {
          orgId: ctx.orgId,
          workflowId: ctx.workflowId,
          leadId: lead.id,
          startNodeId: next,
          pendingStepId: pending.id,
          step: ctx.step + 1,
        };
        const bullJobId = await enqueueAutomation(data, {
          delay: minutes * 60_000,
          jobId: `${ctx.workflowId}:${lead.id}:${pending.id}`,
        });
        await prisma.qcfAutomationPendingStep.update({
          where: { id: pending.id },
          data: { bullJobId },
        });
        return { kind: "wait" };
      }

      case "if_else": {
        const branch = evalIfElse(lead, node.config as IfElseConfig);
        if (branch) {
          // [triggerCount] The rule's condition MATCHED — this is a real "fire"
          // for THIS automation, so bump its "Triggered" count. Incrementing here
          // (per-rule, condition-true) is what makes each rule's count reflect
          // its OWN matches, not "how many leads were edited" (the emitter can't
          // do this — it runs before conditions are evaluated). The if_else sits
          // before any Wait in these rules, and a Wait-resume re-enters runFrom
          // AFTER the wait node, so it never re-runs this if_else — no
          // double-count on resume. Atomic increment; fire-and-forget so a
          // counter write never blocks or fails the run.
          prisma.qcfWorkflowDefinition
            .update({
              where: { id: ctx.workflowId },
              data: { triggerCount: { increment: 1 } },
            })
            .catch((err) =>
              console.warn("[workflow-engine] triggerCount increment failed", { workflowId: ctx.workflowId, err }),
            );
        }
        return { kind: "continue", nextNodeId: pickNext(ctx.graph, node.id, branch ? "true" : "false") };
      }

      case "distribute_lead": {
        // [P3.B3] Assign rules: sequential FIRST-match across `rules`, then the
        // MANDATORY default pool (SPEC §5.4). Round-robin (pickNextUser) is the
        // within-pool mechanism; each rule/default keeps its own cursor via a
        // ruleKey-suffixed node id. Legacy flat `candidateUserIds` still works.
        const cfg = node.config as DistributeConfig;
        const resolved = resolveAssignment(lead, cfg);
        if (!resolved) {
          // Nothing assignable (no rule matched and no default) — leave owner.
          return { kind: "continue", nextNodeId: pickNext(ctx.graph, node.id) };
        }
        // Separate round-robin state per rule/default (keyed on tenant+wf+nodeId).
        const rrNodeId = resolved.ruleKey ? `${node.id}#${resolved.ruleKey}` : node.id;
        const picked = await pickNextUser({
          orgId: ctx.orgId,
          workflowId: ctx.workflowId,
          nodeId: rrNodeId,
          candidateUserIds: resolved.candidateUserIds,
        });
        if (picked) {
          // Rewire (SPEC §5.4 / build plan §0.3): the owner change now routes
          // through the S2 shared write helper instead of a raw crmLead.update —
          // so it gets the SAME 1.3 contract as every other automated write:
          // change-conditional no-op (picked == current owner), loop-guard count
          // + terminate, ownerId→PATCH path, triggerOutboundSync (once), and
          // attribution. No silent trigger suppression (SPEC §1/§5.4).
          const outcome = await applyAutomatedLeadWrite({
            orgId: ctx.orgId,
            lead,
            field: "ownerId",
            value: picked,
            workflowId: ctx.workflowId,
            nodeId: node.id,
            triggerEventId: ctx.triggerEventId,
            triggerType: ctx.triggerType,
            snapshot: ctx.snapshot,
          });
          if (outcome === "terminated") return { kind: "continue", nextNodeId: null };
        }
        return { kind: "continue", nextNodeId: pickNext(ctx.graph, node.id) };
      }

      case "notify_user": {
        const cfg = node.config as { userId?: string; title?: string; body?: string };
        if (cfg.userId) {
          await prisma.qcfNotification.create({
            data: {
              orgId: ctx.orgId,
              userId: cfg.userId,
              title: String(cfg.title || "Workflow notification"),
              body: String(cfg.body || `Lead ${lead.name} workflow update`),
              category: "automation",
              link: `/leads/${lead.id}`,
            },
          });
        }
        return { kind: "continue", nextNodeId: pickNext(ctx.graph, node.id) };
      }

      case "send_email": {
        // [P3.B1+B2] Merge-field substitution + suppression (email-action.ts),
        // then queue + dispatch through the shared mail infra (email-dispatch.ts).
        // A suppressed send (no valid email / Do-Not-Email / unsubscribed) is
        // recorded and skipped; a failed dispatch is recorded — neither throws,
        // so the run continues past the email node (SPEC §5.1).
        const cfg = node.config as { to?: string; subject?: string; body?: string };
        await executeSendEmail({ orgId: ctx.orgId, lead, cfg });
        return { kind: "continue", nextNodeId: pickNext(ctx.graph, node.id) };
      }
    }
  } catch (err) {
    console.warn("[workflow-engine] node failed", { nodeId: node.id, kind: node.kind, err });
    return { kind: "continue", nextNodeId: pickNext(ctx.graph, node.id) };
  }
}

export function pickNext(graph: WorkflowGraph, fromId: string, branch?: "true" | "false"): string | null {
  const edge = graph.edges.find((e) => e.from === fromId && (branch ? e.branch === branch : !e.branch));
  return edge?.to ?? null;
}

// The condition evaluator now lives in conditions.ts (extracted so distribution.ts
// can reuse it without a circular import). Re-exported here for back-compat with
// existing importers/tests that reference it from the engine module.
export { evalCondition, evalIfElse };

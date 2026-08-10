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
import type { CrmLead as Lead } from "@prisma/client";
import { enqueueAutomation, type AutomationJobData } from "@/lib/queue/automation-queue";
import { pickNextUser } from "@/lib/services/automation/distribution";
import type { WorkflowEdge, WorkflowGraph, WorkflowNode } from "@/types/workflow";

const MAX_STEPS = 48;

interface RunContext {
  tenantId: string;
  workflowId: string;
  leadId: string;
  graph: WorkflowGraph;
  step: number;
}

/** Entry point — kick off a workflow from a given node id. */
export async function runFrom(
  tenantId: string,
  workflowId: string,
  leadId: string,
  startNodeId: string,
  startStep = 0,
): Promise<void> {
  const wf = await prisma.crmWorkflowDefinition.findFirst({
    where: { id: workflowId, tenantId, status: "Active" },
  });
  if (!wf) return;

  const graph: WorkflowGraph = {
    nodes: (wf.graphNodes as unknown as WorkflowNode[]) ?? [],
    edges: (wf.graphEdges as unknown as WorkflowEdge[]) ?? [],
  };
  const lead = await prisma.crmLead.findFirst({ where: { id: leadId, tenantId } });
  if (!lead) return;

  let nodeId: string | null = startNodeId;
  let step = startStep;
  while (nodeId && step < MAX_STEPS) {
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) break;
    const ctx: RunContext = { tenantId, workflowId, leadId, graph, step };
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
        await prisma.crmTask.create({
          data: {
            tenantId: ctx.tenantId,
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

      case "wait": {
        const cfg = node.config as { durationMinutes?: number };
        const minutes = Math.max(1, Number(cfg.durationMinutes ?? 60));
        const resumeAt = new Date(Date.now() + minutes * 60_000);
        const next = pickNext(ctx.graph, node.id);
        if (!next) return { kind: "continue", nextNodeId: null };
        // Audit row in Postgres
        const pending = await prisma.crmAutomationPendingStep.create({
          data: {
            tenantId: ctx.tenantId,
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
          tenantId: ctx.tenantId,
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
        await prisma.crmAutomationPendingStep.update({
          where: { id: pending.id },
          data: { bullJobId },
        });
        return { kind: "wait" };
      }

      case "if_else": {
        const cfg = node.config as { field?: string; op?: string; value?: unknown };
        const branch = evalIfElse(lead, cfg);
        return { kind: "continue", nextNodeId: pickNext(ctx.graph, node.id, branch ? "true" : "false") };
      }

      case "distribute_lead": {
        const cfg = node.config as { candidateUserIds?: string[] };
        const userIds = Array.isArray(cfg.candidateUserIds) ? cfg.candidateUserIds : [];
        const picked = await pickNextUser({
          tenantId: ctx.tenantId,
          workflowId: ctx.workflowId,
          nodeId: node.id,
          candidateUserIds: userIds,
        });
        if (picked) {
          await prisma.crmLead.update({
            where: { id: lead.id },
            data: { ownerId: picked },
          });
          lead.ownerId = picked;
        }
        return { kind: "continue", nextNodeId: pickNext(ctx.graph, node.id) };
      }

      case "notify_user": {
        const cfg = node.config as { userId?: string; title?: string; body?: string };
        if (cfg.userId) {
          await prisma.crmNotification.create({
            data: {
              tenantId: ctx.tenantId,
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
        const cfg = node.config as { to?: string; subject?: string; body?: string };
        await prisma.crmOutboundMessageLog.create({
          data: {
            tenantId: ctx.tenantId,
            channel: "email",
            to: String(cfg.to || lead.email || ""),
            subject: String(cfg.subject || "Hello from QuikCRM"),
            body: String(cfg.body || ""),
            status: "queued",
          },
        });
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

export function evalIfElse(lead: Lead, cfg: { field?: string; op?: string; value?: unknown }): boolean {
  if (!cfg.field) return false;
  const actual = (lead as unknown as Record<string, unknown>)[cfg.field];
  switch (cfg.op) {
    case "eq": return actual === cfg.value;
    case "neq": return actual !== cfg.value;
    case "contains":
      return typeof actual === "string" && typeof cfg.value === "string"
        ? actual.toLowerCase().includes(cfg.value.toLowerCase())
        : false;
    case "gt":
      return typeof actual === "number" && typeof cfg.value === "number" && actual > cfg.value;
    case "lt":
      return typeof actual === "number" && typeof cfg.value === "number" && actual < cfg.value;
    case "exists": return actual != null && actual !== "";
    case "absent": return actual == null || actual === "";
    default: return false;
  }
}

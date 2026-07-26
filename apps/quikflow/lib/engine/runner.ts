import { db } from "@/lib/db";
import { Prisma } from "@quikit/database";
import type { EngineEvent, GraphNode, GraphEdge, RunResult, StepResult } from "./types";
import { evaluate, explainStop } from "./conditions";
import { getActionExecutor } from "./actions";
import { resolveParams, type TokenContext } from "./tokens";
import type { EnrichedContext } from "./record";

const MAX_STEPS = 64;

interface WorkflowForRun {
  id: string;
  trigger?: unknown;
  graphNodes: unknown;
  graphEdges: unknown;
}

function asNodes(v: unknown): GraphNode[] {
  return Array.isArray(v) ? (v as GraphNode[]) : [];
}
function asEdges(v: unknown): GraphEdge[] {
  return Array.isArray(v) ? (v as GraphEdge[]) : [];
}

/** Follow the outgoing edge from `fromId` (branch-aware for if_else). */
function pickNext(edges: GraphEdge[], fromId: string, branch?: "true" | "false"): string | null {
  const outgoing = edges.filter((e) => e.from === fromId);
  if (outgoing.length === 0) return null;
  if (branch) {
    const branched = outgoing.find((e) => e.branch === branch);
    if (branched) return branched.to;
  }
  return outgoing[0].to;
}

/** Execute a single node → StepResult. `event` is already record-enriched. */
async function executeNode(
  node: GraphNode,
  event: EngineEvent,
  ctx: { orgId: string; workflowId: string; runId: string },
  tokenCtx: TokenContext,
): Promise<StepResult> {
  switch (node.kind) {
    case "trigger":
      return { status: "ok", output: { event: event.event, app: event.app } };
    case "condition": {
      const pass = evaluate(node, event);
      if (pass) return { status: "ok", output: { conditionMet: true } };
      return {
        status: "skipped",
        stop: true,
        output: { conditionMet: false, reason: explainStop(node, event) ?? "Condition not met, run stopped." },
      };
    }
    case "if_else": {
      const pass = evaluate(node, event);
      return { status: "ok", branch: pass ? "true" : "false" };
    }
    case "action": {
      const executor = getActionExecutor(node.config?.actionId as string | undefined);
      const params = resolveParams(node.config?.params as Record<string, unknown> | undefined, tokenCtx);
      return executor({ ...ctx, event, node, params });
    }
    case "wait":
    case "loop":
    case "approval":
      // Deferred to the time-&-state / advanced phases. Record as a no-op so a
      // basic workflow containing one still completes rather than failing.
      return {
        status: "ok",
        output: { deferred: true, kind: node.kind, note: `${node.kind} runs in a later phase` },
      };
    default:
      return { status: "ok" };
  }
}

/**
 * Run one workflow for one event. Idempotent on (orgId, dedupeKey): a repeated
 * event returns the existing run instead of creating a duplicate. Writes a
 * WfRun plus one WfStepLog per visited node, then finalizes status/duration.
 */
export async function runWorkflow(
  workflow: WorkflowForRun,
  event: EngineEvent,
  runDedupeKey: string,
  context: EnrichedContext,
): Promise<RunResult | null> {
  const startedAt = Date.now();

  // Idempotency guard — unique (orgId, dedupeKey) on WfRun. A retried event
  // (same eventId → same dedupeKey) never double-creates a run or its actions.
  const existing = await db.wfRun.findUnique({
    where: { orgId_dedupeKey: { orgId: event.orgId, dedupeKey: runDedupeKey } },
    select: { id: true, status: true },
  });
  if (existing) return null;

  // The event the graph sees carries the record-enriched data (all columns),
  // so conditions can test `trigger.qtdAchieved` etc. even if the raw event
  // payload didn't include it.
  const enrichedEvent: EngineEvent = { ...event, data: context.data };

  const run = await db.wfRun.create({
    data: {
      orgId: event.orgId,
      workflowId: workflow.id,
      status: "running",
      triggerData: context.data as Prisma.InputJsonValue,
      dedupeKey: runDedupeKey,
    },
    select: { id: true },
  });

  const nodes = asNodes(workflow.graphNodes);
  const edges = asEdges(workflow.graphEdges);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // Start at the trigger node (fallback: first node).
  let current: string | null = (nodes.find((n) => n.kind === "trigger") ?? nodes[0])?.id ?? null;

  const visited = new Set<string>();
  // Step outputs accumulate so later actions can reference {{steps.N.field}}.
  const stepOutputs: Record<string, unknown>[] = [];
  const tokenCtx: TokenContext = { trigger: context.trigger, steps: stepOutputs };
  let steps = 0;
  let failed = false;

  while (current && steps < MAX_STEPS) {
    if (visited.has(current)) break; // cycle guard
    visited.add(current);
    const node = byId.get(current);
    if (!node) break;
    steps += 1;

    let result: StepResult;
    try {
      result = await executeNode(
        node,
        enrichedEvent,
        { orgId: event.orgId, workflowId: workflow.id, runId: run.id },
        tokenCtx,
      );
    } catch (error: unknown) {
      result = { status: "failed", error: error instanceof Error ? error.message : "Action failed" };
    }
    stepOutputs.push(result.output ?? {});

    await db.wfStepLog.create({
      data: {
        orgId: event.orgId,
        runId: run.id,
        nodeId: node.id,
        kind: node.kind,
        label: node.label ?? null,
        status: result.status,
        output: (result.output ?? undefined) as Prisma.InputJsonValue | undefined,
        error: result.error ?? null,
      },
    });

    if (result.status === "failed") {
      failed = true;
      break;
    }
    if (result.stop) break;

    current = pickNext(edges, node.id, result.branch);
  }

  const finishedAt = Date.now();
  const status = failed ? "failed" : "success";

  await db.wfRun.update({
    where: { id: run.id },
    data: { status, finishedAt: new Date(finishedAt), durationMs: finishedAt - startedAt },
  });
  await db.wfWorkflow.update({
    where: { id: workflow.id },
    data: { lastRunAt: new Date(finishedAt) },
  });

  return {
    runId: run.id,
    workflowId: workflow.id,
    status,
    steps,
    durationMs: finishedAt - startedAt,
  };
}

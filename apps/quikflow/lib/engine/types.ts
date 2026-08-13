/**
 * QuikFlow execution engine — shared types (framework-free).
 *
 * The engine is transport-agnostic: it turns an EngineEvent into a persisted
 * WfRun + WfStepLog rows. HOW the event arrives (BullMQ worker, a "Run now"
 * call, or a future queue) is a boundary that lives outside this module.
 */

/** A normalized event that can trigger workflows. */
export interface EngineEvent {
  /** Source app slug, e.g. "quikscale". */
  app: string;
  /** Namespaced event id, e.g. "kpi.below_target". */
  event: string;
  /** Tenant. Every match/run/log is scoped to this. */
  orgId: string;
  /** Idempotency key — a repeated key is a no-op (unique per WfRun). */
  dedupeKey: string;
  /** Event payload; referenced by conditions/actions via `trigger.<field>`. */
  data: Record<string, unknown>;
  /** ISO timestamp the source recorded. */
  occurredAt?: string;
}

/** A single graph node as stored in WfWorkflow.graphNodes. */
export interface GraphNode {
  id: string;
  kind: "trigger" | "action" | "condition" | "if_else" | "wait" | "loop" | "approval";
  label?: string;
  config?: Record<string, unknown>;
}

export interface GraphEdge {
  from: string;
  to: string;
  branch?: "true" | "false";
}

/** Result of executing one node. */
export interface StepResult {
  status: "ok" | "skipped" | "failed";
  output?: Record<string, unknown>;
  error?: string;
  /** For condition/if_else nodes: which branch to follow next. */
  branch?: "true" | "false";
  /** When true, the runner stops walking (a condition filtered the run out). */
  stop?: boolean;
}

/** Outcome of running one workflow for one event. */
export interface RunResult {
  runId: string;
  workflowId: string;
  status: "success" | "failed";
  steps: number;
  durationMs: number;
}

/** Context handed to every action executor. */
export interface ActionContext {
  orgId: string;
  workflowId: string;
  runId: string;
  /** The event, with its data record-enriched (see engine/record.ts). */
  event: EngineEvent;
  node: GraphNode;
  /** The node's `config.params` with all {{tokens}} + relative dates resolved. */
  params?: Record<string, unknown>;
}

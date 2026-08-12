export type NodeKind =
  | "trigger_lead_created"
  | "trigger_lead_updated"
  | "create_task"
  | "wait"
  | "if_else"
  | "distribute_lead"
  | "notify_user"
  | "send_email"
  // Sets a single lead field. Stage routes through transition-service; status/
  // substatus/non-pipeline fields route through the PATCH/save path. See
  // workflow-engine.ts `update_lead_field`. (SPEC §5.3)
  | "update_lead_field";

export interface WorkflowNode {
  id: string;
  kind: NodeKind;
  config: Record<string, unknown>;
}

/** One leaf condition in an if_else test. `value` is a scalar for eq/neq/
 *  contains/gt/lt and an array for the `in` operator. is_defined/is_not_defined
 *  ignore `value`. (SPEC §2) */
export interface WorkflowCondition {
  field: string;
  op:
    | "in" // multi-value IN: actual ∈ (value as unknown[])
    | "eq"
    | "neq"
    | "contains"
    | "gt"
    | "lt"
    | "is_defined" // nullable-field safety (SPEC §2); alias of legacy "exists"
    | "is_not_defined" // alias of legacy "absent"
    | "exists"
    | "absent";
  value?: unknown;
}

/** if_else node config. Two shapes, both evaluate on LATEST lead data (SPEC §2):
 *  - group form (preferred): `conditions` joined by AND (v1 is AND-only; OR /
 *    mixed AND-OR are DEFERRED — SPEC §2).
 *  - legacy single form: bare { field, op, value } (kept for back-compat). */
export interface IfElseConfig {
  conditions?: WorkflowCondition[];
  /** Accepted but only "AND" is honored in v1. */
  connector?: "AND";
  field?: string;
  op?: string;
  value?: unknown;
}

/**
 * distribute_lead node config (SPEC §5.4). Two shapes:
 *   - rule form (preferred): an ordered list of assignment rules evaluated
 *     sequentially first-match-wins, each with an AND group of conditions and a
 *     candidate pool; plus a MANDATORY `defaultUserIds` pool that fires when no
 *     rule matches. Round-robin is the within-pool mechanism.
 *   - legacy flat form: a single `candidateUserIds` round-robin pool (no rules,
 *     no default) — kept working unchanged for pre-B3 definitions.
 */
export interface AssignmentRule {
  /** AND group; an empty/absent group always matches (a catch-all rule). */
  conditions?: WorkflowCondition[];
  /** Round-robin pool for this rule. */
  candidateUserIds: string[];
}

export interface DistributeConfig {
  rules?: AssignmentRule[];
  /** Mandatory default pool — used when no rule matches (rule form only). */
  defaultUserIds?: string[];
  /** Legacy flat round-robin pool (pre-B3 back-compat). */
  candidateUserIds?: string[];
}

export interface WorkflowEdge {
  from: string;
  to: string;
  /** For if_else nodes: "true" or "false" */
  branch?: "true" | "false";
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

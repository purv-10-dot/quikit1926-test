import type { EngineEvent, GraphNode } from "./types";

/**
 * Basic condition evaluator. A condition/if_else node's config looks like:
 *   { field: "trigger.value", operator: "lt", value: 100 }
 * `field` resolves against the event payload; `trigger.` prefix is optional.
 *
 * Kept intentionally small for v1 (single field/operator). A richer boolean
 * tree (or json-logic) can replace this behind the same `evaluate` signature.
 */

export type Operator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "exists"
  | "absent";

interface ConditionConfig {
  field?: string;
  operator?: Operator;
  value?: unknown;
}

/** Resolve `trigger.value` / `value` against the event's data payload. */
function resolveField(event: EngineEvent, field: string): unknown {
  const path = field.startsWith("trigger.") ? field.slice("trigger.".length) : field;
  return path
    .split(".")
    .reduce<unknown>(
      (acc, key) =>
        acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined,
      event.data,
    );
}

function compare(actual: unknown, operator: Operator, expected: unknown): boolean {
  switch (operator) {
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "gt":
      return Number(actual) > Number(expected);
    case "gte":
      return Number(actual) >= Number(expected);
    case "lt":
      return Number(actual) < Number(expected);
    case "lte":
      return Number(actual) <= Number(expected);
    case "contains":
      return String(actual ?? "").includes(String(expected ?? ""));
    case "exists":
      return actual !== undefined && actual !== null;
    case "absent":
      return actual === undefined || actual === null;
    default:
      return false;
  }
}

/**
 * Evaluate a condition/if_else node. A node with no usable config passes
 * (treated as an always-true gate) so a "basic" workflow never gets stuck.
 */
export function evaluate(node: GraphNode, event: EngineEvent): boolean {
  const cfg = (node.config ?? {}) as ConditionConfig;
  if (!cfg.field || !cfg.operator) return true;
  return compare(resolveField(event, cfg.field), cfg.operator, cfg.value);
}

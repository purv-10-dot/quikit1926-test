import type { EngineEvent, GraphNode } from "./types";

/**
 * Condition evaluator. A condition/if_else node's config looks like:
 *   { field: "trigger.value", operator: "lt", value: 100 }
 *   { field: "trigger.days_overdue", operator: "between", value: 3, value2: 10 }
 *   { field: "trigger.entered_at", operator: "within_last", value: 7, unit: "days" }
 * `field` resolves against the event payload; the `trigger.` prefix is optional.
 *
 * Operators mirror the builder catalog (lib/catalog/conditions.ts): string,
 * number, boolean, date, enum and null families. Array/diff/combinator
 * conditions from the spec are intentionally not evaluated here yet (and are
 * not offered by the builder), so a saved condition can always be run.
 */

export type Operator =
  // legacy / number
  | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "between" | "not_between"
  // string
  | "equals" | "not_equals" | "contains" | "not_contains" | "starts_with" | "ends_with"
  | "matches_regex" | "is_empty" | "is_not_empty"
  // boolean
  | "is_true" | "is_false"
  // date
  | "before" | "after" | "within_last" | "more_than_ago" | "is_today" | "is_this_week" | "is_this_month"
  // enum
  | "in" | "not_in"
  // null (+ legacy aliases exists/absent)
  | "is_null" | "is_not_null" | "exists" | "absent";

interface ConditionClause {
  field?: string;
  operator?: Operator;
  value?: unknown;
  value2?: unknown;
  unit?: string;
}

/**
 * A condition node holds either a single clause (legacy shape, fields inline) or
 * a list of `clauses` joined by a `combinator` (doc §3 — "Combine conditions"
 * with And / Or, e.g. status is Red AND category is Financial).
 */
interface ConditionConfig extends ConditionClause {
  combinator?: "and" | "or";
  clauses?: ConditionClause[];
}

/** Resolve a dotted `trigger.a.b` / `a.b` path against a data object. */
function resolvePath(data: Record<string, unknown>, field: string): unknown {
  const path = field.startsWith("trigger.") ? field.slice("trigger.".length) : field;
  return path
    .split(".")
    .reduce<unknown>(
      (acc, key) =>
        acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined,
      data,
    );
}

/** Resolve a field against the event's (possibly record-enriched) data payload. */
function resolveField(event: EngineEvent, field: string): unknown {
  return resolvePath(event.data, field);
}

const UNIT_MS: Record<string, number> = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
  weeks: 604_800_000,
};

function toDate(v: unknown): Date | null {
  if (v === null || v === undefined) return null;
  const d = new Date(v as string | number);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function compare(
  actual: unknown,
  operator: Operator,
  expected: unknown,
  expected2: unknown,
  unit: string | undefined,
): boolean {
  switch (operator) {
    // ── number ──
    case "eq":
      return actual === expected || Number(actual) === Number(expected);
    case "neq":
      return !(actual === expected || Number(actual) === Number(expected));
    case "gt":
      return Number(actual) > Number(expected);
    case "gte":
      return Number(actual) >= Number(expected);
    case "lt":
      return Number(actual) < Number(expected);
    case "lte":
      return Number(actual) <= Number(expected);
    case "between":
      return Number(actual) >= Number(expected) && Number(actual) <= Number(expected2);
    case "not_between":
      return !(Number(actual) >= Number(expected) && Number(actual) <= Number(expected2));

    // ── string ──
    case "equals":
      return String(actual) === String(expected);
    case "not_equals":
      return String(actual) !== String(expected);
    case "contains":
      return String(actual ?? "").includes(String(expected ?? ""));
    case "not_contains":
      return !String(actual ?? "").includes(String(expected ?? ""));
    case "starts_with":
      return String(actual ?? "").startsWith(String(expected ?? ""));
    case "ends_with":
      return String(actual ?? "").endsWith(String(expected ?? ""));
    case "matches_regex":
      try {
        return new RegExp(String(expected ?? "")).test(String(actual ?? ""));
      } catch {
        return false;
      }
    case "is_empty":
      return actual === undefined || actual === null || String(actual) === "";
    case "is_not_empty":
      return !(actual === undefined || actual === null || String(actual) === "");

    // ── boolean ──
    case "is_true":
      return actual === true || actual === "true";
    case "is_false":
      return actual === false || actual === "false";

    // ── date ──
    case "before": {
      const a = toDate(actual);
      const e = toDate(expected);
      return a !== null && e !== null && a.getTime() < e.getTime();
    }
    case "after": {
      const a = toDate(actual);
      const e = toDate(expected);
      return a !== null && e !== null && a.getTime() > e.getTime();
    }
    case "within_last": {
      const a = toDate(actual);
      if (!a) return false;
      const span = Number(expected) * (UNIT_MS[unit ?? "days"] ?? UNIT_MS.days);
      return a.getTime() >= Date.now() - span;
    }
    case "more_than_ago": {
      const a = toDate(actual);
      if (!a) return false;
      const span = Number(expected) * (UNIT_MS[unit ?? "days"] ?? UNIT_MS.days);
      return a.getTime() < Date.now() - span;
    }
    case "is_today": {
      const a = toDate(actual);
      return a !== null && startOfDay(a) === startOfDay(new Date());
    }
    case "is_this_week": {
      const a = toDate(actual);
      if (!a) return false;
      const now = new Date();
      const dow = (now.getDay() + 6) % 7; // Monday = 0
      const monday = startOfDay(now) - dow * UNIT_MS.days;
      return a.getTime() >= monday && a.getTime() < monday + 7 * UNIT_MS.days;
    }
    case "is_this_month": {
      const a = toDate(actual);
      const now = new Date();
      return a !== null && a.getFullYear() === now.getFullYear() && a.getMonth() === now.getMonth();
    }

    // ── enum ──
    case "in":
    case "not_in": {
      const list = String(expected ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const hit = list.includes(String(actual));
      return operator === "in" ? hit : !hit;
    }

    // ── null (+ legacy) ──
    case "is_null":
    case "absent":
      return actual === undefined || actual === null;
    case "is_not_null":
    case "exists":
      return actual !== undefined && actual !== null;

    default:
      return false;
  }
}

/** A single clause with no usable config passes (always-true gate). */
function evalClause(clause: ConditionClause, event: EngineEvent): boolean {
  if (!clause.field || !clause.operator) return true;
  return compare(resolveField(event, clause.field), clause.operator, clause.value, clause.value2, clause.unit);
}

/**
 * Evaluate a condition/if_else node. Supports both shapes:
 *   • multi-clause: `{ combinator: "and"|"or", clauses: [...] }` → clauses joined
 *   • single-clause: fields inline on the config (legacy)
 * A node with no usable config passes so a "basic" workflow never gets stuck.
 */
export function evaluate(node: GraphNode, event: EngineEvent): boolean {
  const cfg = (node.config ?? {}) as ConditionConfig;
  if (Array.isArray(cfg.clauses) && cfg.clauses.length > 0) {
    const results = cfg.clauses.map((c) => evalClause(c, event));
    return cfg.combinator === "or" ? results.some(Boolean) : results.every(Boolean);
  }
  return evalClause(cfg, event);
}

/**
 * Human-readable reason a condition stopped the run — surfaced in the step log
 * so Run History explains WHY a workflow halted instead of showing a silent
 * success. Flags clauses whose field resolved to empty/undefined (the most
 * common Run-now confusion: a condition on a field the sample data didn't
 * carry). Returns null for an empty (always-pass) config.
 */
export function explainStop(node: GraphNode, event: EngineEvent): string | null {
  const cfg = (node.config ?? {}) as ConditionConfig;
  const clauses: ConditionClause[] =
    Array.isArray(cfg.clauses) && cfg.clauses.length > 0 ? cfg.clauses : cfg.field ? [cfg] : [];
  if (clauses.length === 0) return null;
  const failed = clauses.filter((c) => !evalClause(c, event));
  const parts = failed.map((c) => {
    const actual = c.field ? resolveField(event, c.field) : undefined;
    const empty = actual === undefined || actual === null || actual === "";
    const shown = empty ? "(empty)" : JSON.stringify(actual);
    return `${c.field} ${c.operator} ${JSON.stringify(c.value)} — actual ${shown}`;
  });
  return `Condition not met, run stopped. Failing: ${parts.join("; ")}`;
}

/**
 * A saved rule (doc §6): `{ field, op, value }`. Accepts `op` (doc) or
 * `operator` (engine) interchangeably so the same shape drives the trigger
 * filter, the "If" condition, and future branch steps.
 */
export interface Rule {
  field?: string;
  op?: Operator;
  operator?: Operator;
  value?: unknown;
  value2?: unknown;
  unit?: string;
}

/** A rule group: rows joined by And / Or (doc §6 — "Combine conditions"). */
export interface RuleGroup {
  combine?: "and" | "or";
  rules?: Rule[];
}

/**
 * Evaluate a rule group against a data object (the trigger filter runs this on
 * the event's record-enriched payload; an absent/empty group passes — an
 * unfiltered trigger always matches). The single evaluator behind trigger
 * filters, conditions, and branches.
 */
export function evaluateRuleGroup(
  group: RuleGroup | undefined | null,
  data: Record<string, unknown>,
): boolean {
  if (!group || !Array.isArray(group.rules) || group.rules.length === 0) return true;
  const results = group.rules.map((r) => {
    const op = r.op ?? r.operator;
    if (!r.field || !op) return true;
    return compare(resolvePath(data, r.field), op, r.value, r.value2, r.unit);
  });
  return group.combine === "or" ? results.some(Boolean) : results.every(Boolean);
}

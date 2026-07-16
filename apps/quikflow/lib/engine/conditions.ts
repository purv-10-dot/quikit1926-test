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

interface ConditionConfig {
  field?: string;
  operator?: Operator;
  value?: unknown;
  value2?: unknown;
  unit?: string;
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

/**
 * Evaluate a condition/if_else node. A node with no usable config passes
 * (treated as an always-true gate) so a "basic" workflow never gets stuck.
 */
export function evaluate(node: GraphNode, event: EngineEvent): boolean {
  const cfg = (node.config ?? {}) as ConditionConfig;
  if (!cfg.field || !cfg.operator) return true;
  return compare(resolveField(event, cfg.field), cfg.operator, cfg.value, cfg.value2, cfg.unit);
}

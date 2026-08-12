/**
 * Human-readable step labels. Steps default to a generic kind name
 * ("Condition" / "Action") which reads as noise on the canvas and in Run
 * History. These pure helpers derive a descriptive label from what a step
 * actually does — the action's name, or a summary of its condition rules — so
 * every node explains itself at a glance. Framework-free + unit-testable.
 */
import { STEP_KINDS, findAction } from "@/lib/catalog";
import type { RuleRow, Step } from "./types";

/** The generic per-kind label (e.g. "Condition", "Action"). */
export function kindLabel(kind: string): string {
  return STEP_KINDS.find((s) => s.kind === kind)?.label ?? kind;
}

/** True when a stored label is still the generic kind default (not user-set). */
export function isGenericLabel(label: string | undefined, kind: string): boolean {
  return !label || label === kindLabel(kind) || label === kind;
}

/** Short human field name from a dotted ref: "trigger.owner" → "Owner". */
function fieldLabel(field: string | undefined): string {
  const leaf = (field ?? "").split(".").pop() ?? "";
  if (!leaf) return "field";
  const spaced = leaf.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Compact operator phrasing for a rule summary. */
const OP_TEXT: Record<string, string> = {
  eq: "=", equals: "is", neq: "≠", not_equals: "is not",
  gt: ">", gte: "≥", lt: "<", lte: "≤",
  between: "between", not_between: "not between",
  contains: "contains", not_contains: "excludes",
  starts_with: "starts with", ends_with: "ends with", matches_regex: "matches",
  is_empty: "is empty", is_not_empty: "is set",
  is_true: "is true", is_false: "is false",
  before: "before", after: "after", within_last: "within last", more_than_ago: "more than",
  is_today: "is today", is_this_week: "is this week", is_this_month: "is this month",
  in: "is one of", not_in: "is not one of",
  is_null: "is empty", is_not_null: "is set", exists: "is set", absent: "is empty",
};

/** True when the operator needs no value shown (e.g. is empty / is today). */
const NO_VALUE_OPS = new Set([
  "is_empty", "is_not_empty", "is_true", "is_false", "is_today", "is_this_week",
  "is_this_month", "is_null", "is_not_null", "exists", "absent",
]);

function summarizeRule(r: RuleRow): string {
  const op = r.operator ?? "";
  const opText = OP_TEXT[op] ?? op.replace(/_/g, " ") ?? "is";
  const field = fieldLabel(r.field);
  if (NO_VALUE_OPS.has(op)) return `${field} ${opText}`.trim();
  const val = (r.value ?? "").toString().trim();
  return `${field} ${opText} ${val}`.trim();
}

/** Truncate a summary so a node card stays one line. */
function clip(s: string, max = 42): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * Derive a descriptive label for a step. Falls back to the generic kind label
 * when there's nothing to summarize yet (a freshly-added, unconfigured step).
 */
export function deriveStepLabel(step: Pick<Step, "kind" | "actionId" | "rules" | "combine" | "field" | "operator" | "value">): string {
  if (step.kind === "action") {
    return step.actionId ? findAction(step.actionId)?.label ?? kindLabel("action") : kindLabel("action");
  }
  if (step.kind === "condition" || step.kind === "if_else") {
    const rules: RuleRow[] =
      step.rules && step.rules.length > 0
        ? step.rules
        : step.field
          ? [{ field: step.field, operator: step.operator, value: step.value }]
          : [];
    const usable = rules.filter((r) => r.field && r.operator);
    if (usable.length === 0) return kindLabel(step.kind);
    const joiner = step.combine === "or" ? " OR " : " AND ";
    return clip(usable.map(summarizeRule).join(joiner));
  }
  return kindLabel(step.kind);
}

/**
 * The label to SHOW for a step: the user's custom label when set, otherwise the
 * derived descriptive one. Used by the canvas and persisted on save.
 */
export function displayStepLabel(step: Step): string {
  if (step.labelCustom && step.label && !isGenericLabel(step.label, step.kind)) return step.label;
  return deriveStepLabel(step);
}

/**
 * Best-effort label for a recorded run step (Run History). Uses the persisted
 * label unless it's generic, then derives from the step kind + its output
 * (actions record their `actionId`). Keeps OLD runs readable too.
 */
export function runStepLabel(kind: string, label: string | null | undefined, output: Record<string, unknown> | null | undefined): string {
  if (label && !isGenericLabel(label, kind)) return label;
  if (kind === "action") {
    const actionId = output && typeof output.actionId === "string" ? output.actionId : undefined;
    if (actionId) return findAction(actionId)?.label ?? kindLabel("action");
  }
  return label || kindLabel(kind);
}

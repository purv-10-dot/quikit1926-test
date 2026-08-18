/**
 * Condition catalog — operators per data type, from QuikScale-Workflow-Spec
 * (sheet 2 · Conditions). Only the scalar types the engine can evaluate are
 * exposed in the builder (string / number / boolean / date / enum / null);
 * array / diff / combinator conditions are defined here for reference but NOT
 * offered in v1 (the engine doesn't evaluate them yet — see lib/engine/conditions).
 */
export type FieldType = "string" | "number" | "boolean" | "date" | "enum" | "null";

/** How many value inputs an operator needs in the builder. */
export type OperatorArity = "none" | "one" | "range" | "duration";

export interface OperatorDef {
  id: string;
  label: string;
  arity: OperatorArity;
}

/** Operators the builder offers, keyed by the field's inferred data type. */
export const OPERATORS_BY_TYPE: Record<FieldType, OperatorDef[]> = {
  string: [
    { id: "equals", label: "equals", arity: "one" },
    { id: "not_equals", label: "does not equal", arity: "one" },
    { id: "contains", label: "contains", arity: "one" },
    { id: "not_contains", label: "does not contain", arity: "one" },
    { id: "starts_with", label: "starts with", arity: "one" },
    { id: "ends_with", label: "ends with", arity: "one" },
    { id: "matches_regex", label: "matches regex", arity: "one" },
    { id: "is_empty", label: "is empty", arity: "none" },
    { id: "is_not_empty", label: "is not empty", arity: "none" },
  ],
  number: [
    { id: "eq", label: "equals (=)", arity: "one" },
    { id: "neq", label: "not equals (≠)", arity: "one" },
    { id: "gt", label: "greater than (>)", arity: "one" },
    { id: "gte", label: "greater or equal (≥)", arity: "one" },
    { id: "lt", label: "less than (<)", arity: "one" },
    { id: "lte", label: "less or equal (≤)", arity: "one" },
    { id: "between", label: "between", arity: "range" },
    { id: "not_between", label: "not between", arity: "range" },
  ],
  boolean: [
    { id: "is_true", label: "is true", arity: "none" },
    { id: "is_false", label: "is false", arity: "none" },
  ],
  date: [
    { id: "before", label: "before", arity: "one" },
    { id: "after", label: "after", arity: "one" },
    { id: "within_last", label: "within the last", arity: "duration" },
    { id: "more_than_ago", label: "more than … ago", arity: "duration" },
    { id: "is_today", label: "is today", arity: "none" },
    { id: "is_this_week", label: "is this week", arity: "none" },
    { id: "is_this_month", label: "is this month", arity: "none" },
  ],
  enum: [
    { id: "equals", label: "equals", arity: "one" },
    { id: "not_equals", label: "does not equal", arity: "one" },
    { id: "in", label: "is one of (comma-separated)", arity: "one" },
    { id: "not_in", label: "is not one of (comma-separated)", arity: "one" },
  ],
  null: [
    { id: "is_null", label: "is null", arity: "none" },
    { id: "is_not_null", label: "is not null", arity: "none" },
  ],
};

/** Units offered for duration operators (within_last / more_than_ago). */
export const DURATION_UNITS = ["minutes", "hours", "days", "weeks"] as const;

const NUMERIC_LEAVES = new Set([
  "value", "target", "current_value", "progress_pct", "gappct", "milestone_pct", "threshold_pct",
  "days_overdue", "days_since_update", "days_until_due", "week_number", "weeknumber", "duration_minutes",
  "response_rate", "final_response_rate", "response_count", "coherence_score", "overall_score",
  "potential_score", "performance_score", "order_index", "month", "year", "fiscal_year",
  "employee_count", "annual_revenue", "ai_confidence", "stratum_number", "used_this_month",
  "used_today", "monthly_limit", "daily_limit", "pct_used_month",
]);

const ENUM_LEAVES = new Set([
  "rag", "from_rag", "to_rag", "rag_status", "rag_change", "status", "from_status", "to_status",
  "role", "from_role", "to_role", "type", "trend_type", "signal_type", "classification", "quadrant",
  "category", "stage", "size_band", "business_model", "decision", "class", "from_class", "to_class",
  "cadence", "impact", "growth_pace", "region",
]);

const BOOLEAN_LEAVES = new Set([
  "is_active", "is_locked", "is_archived", "is_ai_suggested", "is_overdue", "is_vacant",
  "enthusiastic_rehire", "ai_enabled", "recurring", "is_true", "is_false",
]);

const DATE_LEAVES = new Set([
  "due_date", "freeze_date", "auto_freeze_at", "scheduled_at", "started_at", "completed_at",
  "created_at", "finalized_at", "entered_at", "achieved_at", "assessed_at", "published_at",
  "generated_at", "sent_at", "closed_at", "closed_at", "occurred_at", "expires_at", "scheduled_at",
]);

/**
 * Infer a field's data type from its (leaf) name. `field` may be a dotted ref
 * like "trigger.kpi.rag_status" — only the last segment matters.
 */
export function fieldType(field: string): FieldType {
  const leaf = field.split(".").pop() ?? field;
  const l = leaf.toLowerCase();

  if (l === "id" || l.endsWith("_id") || l.endsWith("id")) {
    // *_id / kpiId etc. are opaque strings, but numeric-ish counters aren't ids.
    if (!NUMERIC_LEAVES.has(l)) return "string";
  }
  if (BOOLEAN_LEAVES.has(l) || l.startsWith("is_") || l.startsWith("has_")) return "boolean";
  if (DATE_LEAVES.has(l) || l.endsWith("_at") || l.endsWith("_date")) return "date";
  if (NUMERIC_LEAVES.has(l) || l.endsWith("_pct") || l.endsWith("_count") || l.endsWith("_score") || l.endsWith("_rate")) return "number";
  if (ENUM_LEAVES.has(l)) return "enum";
  return "string";
}

/** The operators offered for a field, given its inferred type. Null operators
 *  are appended to every type so "is null / is not null" is always available. */
export function operatorsForType(type: FieldType): OperatorDef[] {
  const base = OPERATORS_BY_TYPE[type] ?? OPERATORS_BY_TYPE.string;
  if (type === "null") return base;
  return [...base, ...OPERATORS_BY_TYPE.null];
}

/** Arity for a given operator id (defaults to "one"). */
export function operatorArity(operatorId: string | undefined): OperatorArity {
  if (!operatorId) return "one";
  for (const defs of Object.values(OPERATORS_BY_TYPE)) {
    const found = defs.find((o) => o.id === operatorId);
    if (found) return found.arity;
  }
  return "one";
}

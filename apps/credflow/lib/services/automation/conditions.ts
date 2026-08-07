/**
 * Automation condition evaluator — the shared leaf/group condition logic used by
 * the if_else node (workflow-engine), the assign-rule matcher (distribute_lead,
 * B3) and the publish-time loop check (B4).
 *
 * Extracted verbatim from workflow-engine.ts (no behaviour change) so it can be
 * imported by distribution.ts without a circular dependency (the engine imports
 * distribution.ts). The engine re-exports these for back-compat with existing
 * importers/tests. SPEC §2.
 */
import type { QcfLead as Lead } from "@prisma/client";
import type { IfElseConfig, WorkflowCondition } from "@/types/workflow";

/**
 * Resolve the value a condition targets, from the CURRENT lead.
 *
 * Standard lead COLUMNS (stage, status, substatus, ownerId, source, email, …)
 * are own-properties of the Prisma QcfLead row — read directly.
 *
 * CUSTOM fields (created in Settings → Lead Fields) are NOT columns; their values
 * live in the `dynamicFields` JSON column keyed by field key. So a condition on
 * a custom field must read `lead.dynamicFields[field]`, not `lead[field]` (which
 * would be undefined — the silent-miss this fallback fixes). We distinguish the
 * two by own-property presence: a real column is a key on the lead object; a
 * custom field is not. This mirrors the filter-engine's standard-vs-dynamic
 * split, but in-memory (the automation engine evaluates a loaded lead, it does
 * not build a Prisma WHERE), so no field-type definition is needed to READ.
 */
function resolveFieldValue(lead: Lead, field: string): unknown {
  const row = lead as unknown as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(row, field)) {
    return row[field];
  }
  const dyn = row.dynamicFields;
  if (dyn && typeof dyn === "object") {
    return (dyn as Record<string, unknown>)[field];
  }
  return undefined;
}

/**
 * Evaluate one leaf condition against the lead's CURRENT (latest) value.
 * Nullable-safe: a null/undefined field never throws — it deterministically
 * fails membership/equality and satisfies only is_not_defined. SPEC §2.
 *
 * Array-aware (custom MultiSelect fields store a JSON array, e.g.
 * ["Tally","Busy"]): when `actual` is an array, `eq`/`in` test MEMBERSHIP
 * (does the array contain the value) and `neq` its negation — mirroring the
 * filter-engine's array_contains semantics. Scalar values keep the original
 * strict-equality behaviour unchanged, so every standard-field rule (stage/
 * status/substatus/…) evaluates exactly as before (zero regression).
 */
export function evalCondition(lead: Lead, c: WorkflowCondition): boolean {
  const actual = resolveFieldValue(lead, c.field);
  const actualIsArray = Array.isArray(actual);
  switch (c.op) {
    case "in":
      // Multi-value IN. Scalar actual: actual ∈ list (exact membership, as before).
      // Array actual (MultiSelect custom field): the lead's array contains ANY of
      // the listed values.
      if (!Array.isArray(c.value)) return false;
      return actualIsArray
        ? c.value.some((v) => (actual as unknown[]).includes(v))
        : c.value.some((v) => v === actual);
    case "eq":
      // Array actual: membership (the array contains the value). Scalar: strict eq.
      return actualIsArray ? (actual as unknown[]).includes(c.value) : actual === c.value;
    case "neq":
      return actualIsArray ? !(actual as unknown[]).includes(c.value) : actual !== c.value;
    case "contains":
      return typeof actual === "string" && typeof c.value === "string"
        ? actual.toLowerCase().includes(c.value.toLowerCase())
        : false;
    case "gt":
      return typeof actual === "number" && typeof c.value === "number" && actual > c.value;
    case "lt":
      return typeof actual === "number" && typeof c.value === "number" && actual < c.value;
    case "exists":
    case "is_defined":
      return actualIsArray ? (actual as unknown[]).length > 0 : actual != null && actual !== "";
    case "absent":
    case "is_not_defined":
      return actualIsArray ? (actual as unknown[]).length === 0 : actual == null || actual === "";
    default:
      return false;
  }
}

/**
 * Evaluate an if_else node. Supports two config shapes (SPEC §2):
 *   - group form: `conditions` joined by AND — ALL must hold (v1 is AND-only;
 *     OR / mixed AND-OR are DEFERRED). An empty group is false.
 *   - legacy single form: bare { field, op, value } — evaluated unchanged, so
 *     pre-existing single-value nodes keep working.
 * Always reads latest lead values (evaluate-on-latest).
 */
export function evalIfElse(lead: Lead, cfg: IfElseConfig): boolean {
  if (Array.isArray(cfg.conditions)) {
    if (cfg.conditions.length === 0) return false;
    // v1: AND-only. `connector` is accepted for forward-compat but only "AND"
    // is honored; OR would require the DEFERRED mixed-connector engine.
    return cfg.conditions.every((c) => evalCondition(lead, c));
  }
  if (!cfg.field) return false;
  return evalCondition(lead, {
    field: cfg.field,
    op: (cfg.op ?? "") as WorkflowCondition["op"],
    value: cfg.value,
  });
}

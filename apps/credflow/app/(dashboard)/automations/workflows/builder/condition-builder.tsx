"use client";

import type { IfElseConfig, WorkflowCondition } from "@/types/workflow";

/**
 * [P3.A4] UI for an if_else node's condition group — the author-facing surface
 * of the `P1.2` evaluator the engine already runs (evalIfElse / evalCondition,
 * workflow-engine.ts). v1 is AND-only (SPEC §2); OR / mixed AND-OR are DEFERRED.
 *
 * Config shape written back is the group form: `{ conditions: [...], connector:
 * "AND" }`. The multi-value `in` operator stores an array (this is what lets a
 * rule express "substatus IN [7 values] AND stage IN [15 values]" — R1).
 */

const LEAD_FIELDS = ["stage", "status", "substatus", "ownerId", "source", "email", "phone", "company", "name"];

const OPERATORS: { value: WorkflowCondition["op"]; label: string }[] = [
  { value: "in", label: "is any of (IN)" },
  { value: "eq", label: "equals" },
  { value: "neq", label: "does not equal" },
  { value: "contains", label: "contains" },
  { value: "gt", label: "greater than" },
  { value: "lt", label: "less than" },
  { value: "is_defined", label: "is defined" },
  { value: "is_not_defined", label: "is not defined" },
];

/** Operators that ignore `value`. */
const VALUELESS: WorkflowCondition["op"][] = ["is_defined", "is_not_defined"];

function toConditions(cfg: IfElseConfig): WorkflowCondition[] {
  if (Array.isArray(cfg.conditions)) return cfg.conditions;
  // Migrate a legacy single-form config into the group form for editing.
  if (cfg.field) return [{ field: cfg.field, op: (cfg.op as WorkflowCondition["op"]) ?? "eq", value: cfg.value }];
  return [];
}

/** "a, b, c" <-> ["a","b","c"] for the multi-value IN editor. Exported for the
 *  round-trip test that cross-checks the emitted config against the engine. */
export function formatConditionValue(op: WorkflowCondition["op"], value: unknown): string {
  if (VALUELESS.includes(op)) return "";
  if (op === "in") return Array.isArray(value) ? value.map(String).join(", ") : "";
  return value == null ? "" : String(value);
}

export function parseConditionValue(op: WorkflowCondition["op"], text: string): unknown {
  if (VALUELESS.includes(op)) return undefined;
  if (op === "in") {
    return text
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return text;
}

export function ConditionBuilder({
  value,
  onChange,
}: {
  value: IfElseConfig;
  onChange: (cfg: IfElseConfig) => void;
}) {
  const conditions = toConditions(value);

  function commit(next: WorkflowCondition[]) {
    onChange({ conditions: next, connector: "AND" });
  }

  function update(i: number, patch: Partial<WorkflowCondition>) {
    commit(conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  function addCondition() {
    commit([...conditions, { field: "stage", op: "in", value: [] }]);
  }

  function removeCondition(i: number) {
    commit(conditions.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-crm-muted">
        All of these must be true <span className="font-medium">(AND)</span>. Evaluated on the lead&apos;s latest values.
      </p>

      {conditions.length === 0 && (
        <p className="rounded-lg border border-dashed border-crm-border p-3 text-xs text-crm-muted">
          No conditions yet — an empty group never matches. Add at least one.
        </p>
      )}

      {conditions.map((c, i) => (
        <div key={i} className="rounded-lg border border-crm-border p-3">
          <div className="flex items-center gap-2">
            <input
              list="lead-field-options"
              value={c.field}
              onChange={(e) => update(i, { field: e.target.value })}
              placeholder="field"
              className="w-32 rounded-md border border-crm-border px-2 py-1 text-sm"
            />
            <select
              value={c.op}
              onChange={(e) => {
                const op = e.target.value as WorkflowCondition["op"];
                update(i, { op, value: parseConditionValue(op, formatConditionValue(op, c.value)) });
              }}
              className="rounded-md border border-crm-border px-2 py-1 text-sm"
            >
              {OPERATORS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => removeCondition(i)}
              className="ml-auto rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50"
            >
              Remove
            </button>
          </div>
          {!VALUELESS.includes(c.op) && (
            <input
              value={formatConditionValue(c.op, c.value)}
              onChange={(e) => update(i, { value: parseConditionValue(c.op, e.target.value) })}
              placeholder={c.op === "in" ? "comma-separated values" : "value"}
              className="mt-2 w-full rounded-md border border-crm-border px-2 py-1 text-sm"
            />
          )}
        </div>
      ))}

      <datalist id="lead-field-options">
        {LEAD_FIELDS.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>

      <button
        type="button"
        onClick={addCondition}
        className="rounded-lg border border-crm-border px-3 py-1.5 text-sm text-crm-text hover:bg-crm-panel"
      >
        + Add condition
      </button>
    </div>
  );
}

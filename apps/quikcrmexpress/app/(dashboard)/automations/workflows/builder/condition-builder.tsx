"use client";

import { useEffect, useState } from "react";
import type { IfElseConfig, WorkflowCondition } from "@/types/workflow";

/**
 * [P3.A4] UI for an if_else node's condition group — the author-facing surface
 * of the `P1.2` evaluator the engine already runs (evalIfElse / evalCondition,
 * workflow-engine.ts). v1 is AND-only (SPEC §2); OR / mixed AND-OR are DEFERRED.
 *
 * Config shape written back is the group form: `{ conditions: [...], connector:
 * "AND" }`. The multi-value `in` operator stores an array (this is what lets a
 * rule express "substatus IN [7 values] AND stage IN [15 values]" — R1).
 *
 * UX (2026-08-06): the field is a DROPDOWN (no typing), and the value editor is
 * a real picker fed by /api/leads/field-values — a multiselect checkbox list for
 * `in`, a single-select for eq/neq — so authors never hand-type stage/status
 * values (which contain spaces + parens like "Not Connected(New Lead)" and broke
 * the old comma-separated text box). Free-text remains only for fields the API
 * reports as non-enumerable (source: "none") and for contains/gt/lt.
 */

/** Selectable condition fields (label shown, key stored). Mirrors the lead
 *  fields the engine can evaluate. Enumerable ones get a value dropdown. */
const FIELD_OPTIONS: { key: string; label: string }[] = [
  { key: "stage", label: "Stage" },
  { key: "status", label: "Status" },
  { key: "substatus", label: "Sub Status" },
  { key: "source", label: "Source" },
  { key: "ownerId", label: "Owner" },
  { key: "leadQuality", label: "Lead Quality" },
  { key: "company", label: "Company" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "name", label: "Name" },
];

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
/** Operators whose value is picked from the field's value list (not free text). */
const PICKER_OPS: WorkflowCondition["op"][] = ["in", "eq", "neq"];

type FieldValuesResult =
  | { source: "pipeline" | "options" | "distinct"; values: { value: string; label: string }[] }
  | { source: "none"; values: null; reason?: string };

// Module cache so switching between nodes / re-opening the panel doesn't refetch
// the same field's values. Keyed by field key; [] means "resolved to free-text".
const valueCache = new Map<string, { value: string; label: string }[]>();

/**
 * Fetch pickable values for a field from the same endpoint the advanced filter
 * uses. Returns [] when the field is non-enumerable (free-text) or on error, so
 * the caller falls back to a text input.
 */
function useFieldValues(field: string): { options: { value: string; label: string }[]; loading: boolean } {
  const [options, setOptions] = useState<{ value: string; label: string }[]>(() => valueCache.get(field) ?? []);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const cached = valueCache.get(field);
    if (cached) {
      setOptions(cached);
      return;
    }
    setLoading(true);
    setOptions([]);
    fetch(`/api/leads/field-values?field=${encodeURIComponent(field)}`, { credentials: "include" })
      .then((r) => (r.ok ? (r.json() as Promise<FieldValuesResult>) : null))
      .then((json) => {
        if (cancelled) return;
        const list = json && json.source !== "none" && Array.isArray(json.values) ? json.values : [];
        valueCache.set(field, list);
        setOptions(list);
      })
      .catch(() => {
        if (!cancelled) {
          valueCache.set(field, []);
          setOptions([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [field]);

  return { options, loading };
}

function toConditions(cfg: IfElseConfig): WorkflowCondition[] {
  if (Array.isArray(cfg.conditions)) return cfg.conditions;
  // Migrate a legacy single-form config into the group form for editing.
  if (cfg.field) return [{ field: cfg.field, op: (cfg.op as WorkflowCondition["op"]) ?? "eq", value: cfg.value }];
  return [];
}

/** "a, b, c" <-> ["a","b","c"] for the multi-value IN editor. Exported for the
 *  round-trip test that cross-checks the emitted config against the engine.
 *  (Kept for engine-contract compatibility even though the UI now uses pickers.) */
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

/** Normalize a condition's stored value into a string[] for multiselect. */
function asArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (value == null || value === "") return [];
  return [String(value)];
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
        <ConditionRow
          key={i}
          condition={c}
          onFieldChange={(field) => update(i, { field, value: c.op === "in" ? [] : "" })}
          onOpChange={(op) => update(i, { op, value: op === "in" ? asArray(c.value) : VALUELESS.includes(op) ? undefined : "" })}
          onValueChange={(v) => update(i, { value: v })}
          onRemove={() => removeCondition(i)}
        />
      ))}

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

function ConditionRow({
  condition: c,
  onFieldChange,
  onOpChange,
  onValueChange,
  onRemove,
}: {
  condition: WorkflowCondition;
  onFieldChange: (field: string) => void;
  onOpChange: (op: WorkflowCondition["op"]) => void;
  onValueChange: (value: unknown) => void;
  onRemove: () => void;
}) {
  const { options, loading } = useFieldValues(c.field);
  const hasPicker = PICKER_OPS.includes(c.op) && options.length > 0;

  return (
    <div className="rounded-lg border border-crm-border p-3">
      <div className="flex items-center gap-2">
        {/* Field — real dropdown, no typing */}
        <select
          value={c.field}
          onChange={(e) => onFieldChange(e.target.value)}
          className="w-36 rounded-md border border-crm-border px-2 py-1 text-sm"
        >
          {FIELD_OPTIONS.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
          {/* If the stored field isn't in the known list, keep it selectable. */}
          {!FIELD_OPTIONS.some((f) => f.key === c.field) && <option value={c.field}>{c.field}</option>}
        </select>

        <select
          value={c.op}
          onChange={(e) => onOpChange(e.target.value as WorkflowCondition["op"])}
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
          onClick={onRemove}
          className="ml-auto rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50"
        >
          Remove
        </button>
      </div>

      {/* Value editor */}
      {!VALUELESS.includes(c.op) && (
        <div className="mt-2">
          {loading && <p className="text-xs text-crm-muted">Loading values…</p>}

          {!loading && hasPicker && c.op === "in" && (
            <MultiSelect
              options={options}
              selected={asArray(c.value)}
              onChange={(vals) => onValueChange(vals)}
            />
          )}

          {!loading && hasPicker && (c.op === "eq" || c.op === "neq") && (
            <select
              value={typeof c.value === "string" ? c.value : ""}
              onChange={(e) => onValueChange(e.target.value)}
              className="w-full rounded-md border border-crm-border px-2 py-1 text-sm"
            >
              <option value="">— select —</option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}

          {/* Free-text fallback: non-enumerable field, or contains/gt/lt. */}
          {!loading && !hasPicker && (
            <input
              value={formatConditionValue(c.op, c.value)}
              onChange={(e) => onValueChange(parseConditionValue(c.op, e.target.value))}
              placeholder={c.op === "in" ? "comma-separated values" : "value"}
              className="w-full rounded-md border border-crm-border px-2 py-1 text-sm"
            />
          )}
        </div>
      )}
    </div>
  );
}

/** Compact multiselect: a scrollable checkbox list + selected-count chips. */
function MultiSelect({
  options,
  selected,
  onChange,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (vals: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (val: string) =>
    onChange(selected.includes(val) ? selected.filter((v) => v !== val) : [...selected, val]);

  return (
    <div className="rounded-md border border-crm-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-2 py-1 text-left text-sm"
      >
        <span className={selected.length ? "text-crm-text" : "text-crm-muted"}>
          {selected.length ? `${selected.length} selected` : "Select values…"}
        </span>
        <span className="text-crm-muted">{open ? "▲" : "▼"}</span>
      </button>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 px-2 pb-1">
          {selected.map((v) => {
            const label = options.find((o) => o.value === v)?.label ?? v;
            return (
              <span key={v} className="inline-flex items-center gap-1 rounded bg-crm-panel px-1.5 py-0.5 text-xs">
                {label}
                <button type="button" onClick={() => toggle(v)} className="text-crm-muted hover:text-red-600" aria-label={`Remove ${label}`}>
                  ✕
                </button>
              </span>
            );
          })}
        </div>
      )}

      {open && (
        <div className="max-h-48 overflow-y-auto border-t border-crm-border p-1">
          <label className="flex items-center gap-2 px-1 py-1 text-xs text-crm-muted">
            <button
              type="button"
              onClick={() => onChange(selected.length === options.length ? [] : options.map((o) => o.value))}
              className="rounded border border-crm-border px-1.5 py-0.5 hover:bg-crm-panel"
            >
              {selected.length === options.length ? "Clear all" : "Select all"}
            </button>
          </label>
          {options.map((o) => (
            <label key={o.value} className="flex items-center gap-2 px-1 py-1 text-sm hover:bg-crm-panel">
              <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

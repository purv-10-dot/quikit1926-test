"use client";

import { Plus, X } from "lucide-react";
import {
  operatorsForType,
  operatorArity,
  DURATION_UNITS,
  type ConditionField,
} from "@/lib/catalog";
import type { RuleRow } from "@/lib/builder/types";
import { ValuePicker } from "./value-picker";
import { cn } from "@/lib/utils";

const INPUT_CLS = "w-full rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-sm";

/**
 * The reusable rule-group editor (Data-Level Design §6). Rows of
 * field → operator → value, joined by And / Or. The exact same component powers
 * the trigger "Only when…" filter and the "If" condition step — each row's value
 * control is the data-level ValuePicker, so people/reference fields load real
 * options (Rohit).
 */
export function RuleGroupEditor({
  fields,
  combine,
  rules,
  onChange,
  addLabel = "Add condition",
  emptyHint,
}: {
  fields: ConditionField[];
  combine: "and" | "or";
  rules: RuleRow[];
  onChange: (patch: { combine?: "and" | "or"; rules?: RuleRow[] }) => void;
  addLabel?: string;
  emptyHint?: string;
}) {
  const setRow = (i: number, patch: Partial<RuleRow>) =>
    onChange({ rules: rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) });
  const addRow = () => onChange({ rules: [...rules, {}] });
  const removeRow = (i: number) => onChange({ rules: rules.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-3">
      {rules.length > 1 ? (
        <div className="inline-flex overflow-hidden rounded-lg border border-[var(--color-border)] text-xs">
          {(["and", "or"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange({ combine: c })}
              className={cn(
                "px-3 py-1 font-medium uppercase",
                combine === c ? "bg-accent-600 text-white" : "text-gray-600 hover:bg-[var(--color-bg-secondary)]",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      ) : null}

      {rules.map((row, i) => {
        const selectedField = fields.find((f) => f.id === row.field);
        const type = selectedField?.type ?? "string";
        const arity = operatorArity(row.operator);
        return (
          <div key={i} className="rounded-lg border border-[var(--color-border)] p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">Condition {i + 1}</span>
              <button
                type="button"
                aria-label="Remove condition"
                onClick={() => removeRow(i)}
                className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="space-y-2">
              <select
                value={row.field ?? ""}
                onChange={(e) => setRow(i, { field: e.target.value, operator: "", value: "", value2: "", unit: "" })}
                className={INPUT_CLS}
              >
                <option value="">{fields.length ? "Choose a field…" : "Pick a trigger event first"}</option>
                {fields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
              <select
                value={row.operator ?? ""}
                onChange={(e) => setRow(i, { operator: e.target.value })}
                disabled={!row.field}
                className={cn(INPUT_CLS, "disabled:opacity-50")}
              >
                <option value="">Operator…</option>
                {operatorsForType(type).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              {arity === "one" ? (
                <ValuePicker
                  field={selectedField}
                  value={row.value ?? ""}
                  onChange={(v) => setRow(i, { value: v })}
                />
              ) : arity === "range" ? (
                <div className="grid grid-cols-2 gap-2">
                  <input value={row.value ?? ""} onChange={(e) => setRow(i, { value: e.target.value })} placeholder="min" className={INPUT_CLS} />
                  <input value={row.value2 ?? ""} onChange={(e) => setRow(i, { value2: e.target.value })} placeholder="max" className={INPUT_CLS} />
                </div>
              ) : arity === "duration" ? (
                <div className="grid grid-cols-2 gap-2">
                  <input value={row.value ?? ""} onChange={(e) => setRow(i, { value: e.target.value })} placeholder="e.g. 7" className={INPUT_CLS} />
                  <select value={row.unit ?? "days"} onChange={(e) => setRow(i, { unit: e.target.value })} className={INPUT_CLS}>
                    {DURATION_UNITS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}

      {rules.length === 0 && emptyHint ? (
        <p className="text-xs text-gray-500">{emptyHint}</p>
      ) : null}

      <button
        type="button"
        onClick={addRow}
        className="flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-accent-700 hover:bg-accent-50"
      >
        <Plus className="h-4 w-4" />
        {addLabel}
      </button>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  OPPORTUNITY_FILTER_FIELDS,
  getOpportunityFilterField,
} from "@/lib/opportunity-filter-fields";
import { useToast } from "@/hooks/use-toast";
import {
  DEFAULT_OPERATORS,
  OPERATOR_LABEL,
  type ConditionRow,
  type FilterFieldDef,
  type FilterOperator,
  type FilterPayload,
  type MatchMode,
} from "@/types/lead-filter";

const VALUELESS = new Set<FilterOperator>([
  "isEmpty",
  "isNotEmpty",
  "isTrue",
  "isFalse",
]);

/** Operators the opportunities filter API supports. */
const SUPPORTED_OPERATORS = new Set<FilterOperator>([
  "eq",
  "neq",
  "contains",
  "startsWith",
  "endsWith",
  "in",
  "notIn",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
  "before",
  "after",
  "on",
  "isEmpty",
  "isNotEmpty",
]);

function operatorsFor(def: FilterFieldDef | undefined): FilterOperator[] {
  if (!def) return [];
  const base = def.operators ?? DEFAULT_OPERATORS[def.type];
  return base.filter((op) => SUPPORTED_OPERATORS.has(op));
}

function makeBlankCondition(): ConditionRow {
  const first = OPPORTUNITY_FILTER_FIELDS[0]!;
  const op = operatorsFor(first)[0]!;
  return { field: first.field, operator: op, value: "" };
}

interface Props {
  open: boolean;
  initial?: FilterPayload;
  onClose: () => void;
  onApply: (payload: FilterPayload) => void;
  /** Runtime-supplied dropdown options keyed by field (e.g. owner names). */
  dynamicOptions?: Record<string, { value: string; label: string }[]>;
}

export function OpportunityAdvancedFilterModal({
  open,
  initial,
  onClose,
  onApply,
  dynamicOptions,
}: Props) {
  const toast = useToast();
  const [matchMode, setMatchMode] = useState<MatchMode>(initial?.matchMode ?? "ALL");
  const [rows, setRows] = useState<ConditionRow[]>(
    initial?.conditions?.length ? initial.conditions : [makeBlankCondition()],
  );

  useEffect(() => {
    if (open) {
      setMatchMode(initial?.matchMode ?? "ALL");
      setRows(
        initial?.conditions?.length ? initial.conditions : [makeBlankCondition()],
      );
    }
  }, [open, initial]);

  function addRow() {
    setRows((rs) => [...rs, makeBlankCondition()]);
  }
  function updateRow(idx: number, next: ConditionRow) {
    setRows((rs) => rs.map((r, i) => (i === idx ? next : r)));
  }
  function removeRow(idx: number) {
    setRows((rs) => (rs.length === 1 ? rs : rs.filter((_, i) => i !== idx)));
  }
  function clearAll() {
    setRows([makeBlankCondition()]);
    setMatchMode("ALL");
  }

  function build(): FilterPayload {
    const cleaned = rows.filter((r) => {
      const def = getOpportunityFilterField(r.field);
      if (!def) return false;
      if (VALUELESS.has(r.operator)) return true;
      if (r.value == null || r.value === "") return false;
      if (Array.isArray(r.value) && r.value.length === 0) return false;
      return true;
    });
    return { matchMode, conditions: cleaned };
  }

  function handleApply() {
    const payload = build();
    const hadInput = rows.some(
      (r) =>
        VALUELESS.has(r.operator) ||
        (r.value != null && r.value !== "" && !(Array.isArray(r.value) && r.value.length === 0)),
    );
    if (hadInput && payload.conditions.length === 0) {
      toast.error("Complete each condition (field, operator, and value) before applying.");
      return;
    }
    onApply(payload);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Advanced filter" width="max-w-3xl">
      <div className="mb-3 flex items-center gap-3 text-sm">
        <span className="text-crm-muted">Match</span>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name="opportunity-match"
            value="ALL"
            checked={matchMode === "ALL"}
            onChange={() => setMatchMode("ALL")}
          />
          ALL conditions (AND)
        </label>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name="opportunity-match"
            value="ANY"
            checked={matchMode === "ANY"}
            onChange={() => setMatchMode("ANY")}
          />
          ANY condition (OR)
        </label>
      </div>

      <div className="space-y-2">
        {rows.map((r, i) => (
          <OpportunityConditionRowEditor
            key={i}
            row={r}
            onChange={(next) => updateRow(i, next)}
            onRemove={() => removeRow(i)}
            dynamicOptions={dynamicOptions}
          />
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button variant="ghost" type="button" onClick={addRow}>
          <Plus size={14} /> Add condition
        </Button>
        <button
          type="button"
          onClick={clearAll}
          className="ml-2 text-xs text-crm-muted hover:text-crm-text"
        >
          Clear all
        </button>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" onClick={handleApply}>
          Apply
        </Button>
      </div>
    </Modal>
  );
}

function applyDynamicOptions(
  def: FilterFieldDef | undefined,
  dynamicOptions: Record<string, { value: string; label: string }[]>,
): FilterFieldDef | undefined {
  if (!def) return def;
  const opts = dynamicOptions[def.field];
  if (!opts || opts.length === 0) return def;
  return { ...def, type: "select", options: opts };
}

function OpportunityConditionRowEditor({
  row,
  onChange,
  onRemove,
  dynamicOptions = {},
}: {
  row: ConditionRow;
  onChange: (next: ConditionRow) => void;
  onRemove: () => void;
  dynamicOptions?: Record<string, { value: string; label: string }[]>;
}) {
  const rawDef = getOpportunityFilterField(row.field);
  const def = applyDynamicOptions(rawDef, dynamicOptions);
  const operators = operatorsFor(def);

  function setField(name: string) {
    const rawNewDef = getOpportunityFilterField(name);
    const newDef = applyDynamicOptions(rawNewDef, dynamicOptions);
    const newOp = operatorsFor(newDef)[0] ?? "eq";
    onChange({ field: name, operator: newOp, value: undefined, valueTo: undefined });
  }

  function setOperator(op: FilterOperator) {
    onChange({
      ...row,
      operator: op,
      value: VALUELESS.has(op) ? undefined : row.value,
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-crm-border bg-crm-panel p-2">
      <Select
        value={row.field}
        onChange={(e) => setField(e.target.value)}
        className="min-w-[10rem]"
      >
        {OPPORTUNITY_FILTER_FIELDS.map((f) => (
          <option key={f.field} value={f.field}>
            {f.label}
          </option>
        ))}
      </Select>

      <Select
        value={row.operator}
        onChange={(e) => setOperator(e.target.value as FilterOperator)}
        className="min-w-[9rem]"
      >
        {operators.map((op) => (
          <option key={op} value={op}>
            {OPERATOR_LABEL[op]}
          </option>
        ))}
      </Select>

      {!VALUELESS.has(row.operator) && def && (
        <ValueInput row={row} def={def} onChange={onChange} />
      )}

      <button
        onClick={onRemove}
        className="ml-auto rounded-md p-2 text-crm-muted hover:bg-white hover:text-red-600"
        aria-label="Remove condition"
        type="button"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function ValueInput({
  row,
  def,
  onChange,
}: {
  row: ConditionRow;
  def: FilterFieldDef;
  onChange: (next: ConditionRow) => void;
}) {
  const between = row.operator === "between";

  if (def.type === "select") {
    const isMulti = row.operator === "in" || row.operator === "notIn";
    const value = Array.isArray(row.value)
      ? (row.value as string[])
      : row.value != null
      ? [row.value as string]
      : [];
    if (isMulti) {
      return (
        <select
          multiple
          className="crm-input min-w-[12rem]"
          value={value}
          onChange={(e) => {
            const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
            onChange({ ...row, value: selected });
          }}
        >
          {def.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    return (
      <Select
        value={String(row.value ?? "")}
        onChange={(e) => onChange({ ...row, value: e.target.value })}
        className="min-w-[10rem]"
      >
        <option value="">—</option>
        {def.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    );
  }

  if (def.type === "date") {
    return (
      <>
        <Input
          type="date"
          value={typeof row.value === "string" ? row.value : ""}
          onChange={(e) => onChange({ ...row, value: e.target.value })}
          className="min-w-[10rem]"
        />
        {between && (
          <>
            <span className="text-xs text-crm-muted">to</span>
            <Input
              type="date"
              value={typeof row.valueTo === "string" ? row.valueTo : ""}
              onChange={(e) => onChange({ ...row, valueTo: e.target.value })}
              className="min-w-[10rem]"
            />
          </>
        )}
      </>
    );
  }

  if (def.type === "number") {
    return (
      <>
        <Input
          type="number"
          value={
            typeof row.value === "number" || typeof row.value === "string"
              ? row.value
              : ""
          }
          onChange={(e) =>
            onChange({
              ...row,
              value: e.target.value === "" ? null : Number(e.target.value),
            })
          }
          className="w-32"
        />
        {between && (
          <>
            <span className="text-xs text-crm-muted">to</span>
            <Input
              type="number"
              value={
                typeof row.valueTo === "number" || typeof row.valueTo === "string"
                  ? row.valueTo
                  : ""
              }
              onChange={(e) =>
                onChange({
                  ...row,
                  valueTo: e.target.value === "" ? null : Number(e.target.value),
                })
              }
              className="w-32"
            />
          </>
        )}
      </>
    );
  }

  return (
    <Input
      type="text"
      value={typeof row.value === "string" ? row.value : ""}
      onChange={(e) => onChange({ ...row, value: e.target.value })}
      className="min-w-[12rem]"
    />
  );
}

export function OpportunityAppliedFilterSummary({
  filter,
  onClear,
}: {
  filter: FilterPayload;
  onClear: () => void;
}) {
  if (!filter.conditions.length) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-crm-blue-soft px-3 py-2 text-xs text-crm-blue-dark">
      <span className="font-medium">
        {filter.conditions.length}{" "}
        {filter.conditions.length === 1 ? "condition" : "conditions"} ({filter.matchMode})
      </span>
      <span className="text-crm-blue-dark/70">·</span>
      {filter.conditions.map((c, i) => {
        const def = getOpportunityFilterField(c.field);
        const v = Array.isArray(c.value) ? c.value.join(", ") : c.value ?? "";
        return (
          <span
            key={i}
            className="rounded-full border border-crm-blue/30 bg-white/60 px-2 py-0.5"
          >
            <span className="font-medium">{def?.label ?? c.field}</span>{" "}
            <span className="text-crm-muted">{OPERATOR_LABEL[c.operator]}</span>{" "}
            {String(v)}
          </span>
        );
      })}
      <button
        onClick={onClear}
        className="ml-auto inline-flex items-center gap-1 hover:text-crm-blue"
      >
        <X size={12} /> Clear all
      </button>
    </div>
  );
}

/**
 * Translate the lead-style FilterPayload (what the modal produces) into the
 * opportunities API DTO (`{ conditions, combinator }`). Keep in sync with
 * `lib/services/opportunities/filter-engine.ts`.
 */
export function buildOpportunityFilterRequest(filter: FilterPayload): {
  conditions: Array<{
    field: string;
    operator: string;
    value?: unknown;
    values?: unknown[];
  }>;
  combinator: "AND" | "OR";
} {
  const out: ReturnType<typeof buildOpportunityFilterRequest>["conditions"] = [];
  for (const c of filter.conditions) {
    switch (c.operator) {
      case "eq":
        out.push({ field: c.field, operator: "eq", value: c.value });
        break;
      case "neq":
        out.push({ field: c.field, operator: "ne", value: c.value });
        break;
      case "contains":
        out.push({ field: c.field, operator: "contains", value: c.value });
        break;
      case "startsWith":
        out.push({ field: c.field, operator: "startsWith", value: c.value });
        break;
      case "endsWith":
        out.push({ field: c.field, operator: "endsWith", value: c.value });
        break;
      case "in":
        out.push({
          field: c.field,
          operator: "in",
          values: Array.isArray(c.value) ? c.value : c.value != null ? [c.value] : [],
        });
        break;
      case "notIn":
        out.push({
          field: c.field,
          operator: "notIn",
          values: Array.isArray(c.value) ? c.value : c.value != null ? [c.value] : [],
        });
        break;
      case "gt":
      case "after":
        out.push({ field: c.field, operator: "gt", value: c.value });
        break;
      case "gte":
        out.push({ field: c.field, operator: "gte", value: c.value });
        break;
      case "lt":
      case "before":
        out.push({ field: c.field, operator: "lt", value: c.value });
        break;
      case "lte":
        out.push({ field: c.field, operator: "lte", value: c.value });
        break;
      case "on":
        out.push({ field: c.field, operator: "eq", value: c.value });
        break;
      case "between":
        if (c.value != null && c.valueTo != null) {
          out.push({
            field: c.field,
            operator: "between",
            values: [c.value as unknown, c.valueTo as unknown],
          });
        }
        break;
      case "isEmpty":
        out.push({ field: c.field, operator: "isNull" });
        break;
      case "isNotEmpty":
        out.push({ field: c.field, operator: "notNull" });
        break;
      default:
        // Unsupported operator — skip silently. The picker hides these, so
        // hitting this branch implies a stale saved view.
        break;
    }
  }
  return { conditions: out, combinator: filter.matchMode === "ANY" ? "OR" : "AND" };
}

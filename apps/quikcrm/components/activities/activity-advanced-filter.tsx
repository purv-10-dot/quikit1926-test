"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  ACTIVITY_FILTER_FIELDS,
  getActivityFilterField,
} from "@/lib/activity-filter-fields";
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

function makeBlankCondition(): ConditionRow {
  const first = ACTIVITY_FILTER_FIELDS[0]!;
  const op = (first.operators ?? DEFAULT_OPERATORS[first.type])[0]!;
  return { field: first.field, operator: op, value: "" };
}

interface Props {
  open: boolean;
  initial?: FilterPayload;
  onClose: () => void;
  onApply: (payload: FilterPayload) => void;
}

export function ActivityAdvancedFilterModal({ open, initial, onClose, onApply }: Props) {
  const [matchMode, setMatchMode] = useState<MatchMode>(initial?.matchMode ?? "ALL");
  const [rows, setRows] = useState<ConditionRow[]>(
    initial?.conditions?.length ? initial.conditions : [makeBlankCondition()],
  );

  useEffect(() => {
    if (open) {
      setMatchMode(initial?.matchMode ?? "ALL");
      setRows(initial?.conditions?.length ? initial.conditions : [makeBlankCondition()]);
    }
  }, [open, initial]);

  function build(): FilterPayload {
    const cleaned = rows.filter((r) => {
      const def = getActivityFilterField(r.field);
      if (!def) return false;
      if (VALUELESS.has(r.operator)) return true;
      if (r.value == null || r.value === "") return false;
      return true;
    });
    return { matchMode, conditions: cleaned };
  }

  return (
    <Modal open={open} onClose={onClose} title="Advanced filter" width="max-w-3xl">
      <div className="mb-3 flex items-center gap-3 text-sm">
        <span className="text-crm-muted">Match</span>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name="activity-match"
            value="ALL"
            checked={matchMode === "ALL"}
            onChange={() => setMatchMode("ALL")}
          />
          ALL conditions (AND)
        </label>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name="activity-match"
            value="ANY"
            checked={matchMode === "ANY"}
            onChange={() => setMatchMode("ANY")}
          />
          ANY condition (OR)
        </label>
      </div>

      <div className="space-y-2">
        {rows.map((r, i) => (
          <ActivityConditionRow
            key={i}
            row={r}
            onChange={(next) => setRows((rs) => rs.map((x, j) => (j === i ? next : x)))}
            onRemove={() => setRows((rs) => (rs.length === 1 ? rs : rs.filter((_, j) => j !== i)))}
          />
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button variant="ghost" type="button" onClick={() => setRows((rs) => [...rs, makeBlankCondition()])}>
          <Plus size={14} /> Add condition
        </Button>
        <button
          type="button"
          onClick={() => {
            setRows([makeBlankCondition()]);
            setMatchMode("ALL");
          }}
          className="ml-2 text-xs text-crm-muted hover:text-crm-text"
        >
          Clear all
        </button>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={() => {
            onApply(build());
            onClose();
          }}
        >
          Apply
        </Button>
      </div>
    </Modal>
  );
}

function ActivityConditionRow({
  row,
  onChange,
  onRemove,
}: {
  row: ConditionRow;
  onChange: (next: ConditionRow) => void;
  onRemove: () => void;
}) {
  const def = getActivityFilterField(row.field);
  const operators = def?.operators ?? (def ? DEFAULT_OPERATORS[def.type] : []);

  function setField(name: string) {
    const newDef = getActivityFilterField(name);
    const newOp =
      (newDef?.operators ?? (newDef ? DEFAULT_OPERATORS[newDef.type] : []))[0] ?? "eq";
    onChange({ field: name, operator: newOp, value: undefined, valueTo: undefined });
  }
  function setOperator(op: FilterOperator) {
    onChange({ ...row, operator: op, value: VALUELESS.has(op) ? undefined : row.value });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-crm-border bg-crm-panel p-2">
      <Select value={row.field} onChange={(e) => setField(e.target.value)} className="min-w-[10rem]">
        {ACTIVITY_FILTER_FIELDS.map((f) => (
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
    const value = Array.isArray(row.value) ? (row.value as string[]) : row.value != null ? [row.value as string] : [];
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

  return (
    <Input
      type="text"
      value={typeof row.value === "string" ? row.value : ""}
      onChange={(e) => onChange({ ...row, value: e.target.value })}
      className="min-w-[12rem]"
    />
  );
}

export function ActivityAppliedFilterSummary({
  filter,
  onClear,
}: {
  filter: FilterPayload;
  onClear: () => void;
}) {
  if (!filter.conditions.length) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-crm-blue-soft px-3 py-2 text-xs text-crm-blue-dark">
      <span className="font-medium">
        {filter.conditions.length} {filter.conditions.length === 1 ? "condition" : "conditions"} ({filter.matchMode})
      </span>
      <span className="text-crm-blue-dark/70">·</span>
      {filter.conditions.map((c, i) => {
        const def = getActivityFilterField(c.field);
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

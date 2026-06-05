"use client";

import { Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { LEAD_FILTER_FIELDS, getFilterField as getStaticField } from "@/lib/lead-filter-fields";
import { DEFAULT_OPERATORS, OPERATOR_LABEL, type ConditionRow, type FilterFieldDef, type FilterOperator } from "@/types/lead-filter";

interface Props {
  row: ConditionRow;
  onChange: (next: ConditionRow) => void;
  onRemove: () => void;
  /** Extra fields beyond the static lead catalog (e.g. org custom fields). */
  extraFields?: FilterFieldDef[];
  /**
   * Runtime-supplied option lists keyed by field name. When a field has an
   * entry here, it is rendered as a select regardless of the catalog's
   * declared type — used for fields like `ownerName` whose values aren't
   * known at build time.
   */
  dynamicOptions?: Record<string, { value: string; label: string }[]>;
}

const VALUELESS = new Set<FilterOperator>(["isEmpty", "isNotEmpty", "isTrue", "isFalse"]);

/** Merge in runtime options when the field has any — promotes type to "select". */
function applyDynamicOptions(
  def: FilterFieldDef | undefined,
  dynamicOptions: Record<string, { value: string; label: string }[]>,
): FilterFieldDef | undefined {
  if (!def) return def;
  const opts = dynamicOptions[def.field];
  if (!opts || opts.length === 0) return def;
  return { ...def, type: "select", options: opts };
}

export function ConditionRowEditor({
  row,
  onChange,
  onRemove,
  extraFields = [],
  dynamicOptions = {},
}: Props) {
  const allFields: FilterFieldDef[] = [...LEAD_FILTER_FIELDS, ...extraFields];
  const rawDef = allFields.find((f) => f.field === row.field) ?? getStaticField(row.field);
  const def = applyDynamicOptions(rawDef, dynamicOptions);
  const operators = def?.operators ?? (def ? DEFAULT_OPERATORS[def.type] : []);

  function setField(name: string) {
    const rawNewDef = allFields.find((f) => f.field === name);
    const newDef = applyDynamicOptions(rawNewDef, dynamicOptions);
    const newOp = (newDef?.operators ?? (newDef ? DEFAULT_OPERATORS[newDef.type] : []))[0] ?? "eq";
    onChange({ field: name, operator: newOp, value: undefined, valueTo: undefined });
  }

  function setOperator(op: FilterOperator) {
    onChange({ ...row, operator: op, value: VALUELESS.has(op) ? undefined : row.value });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-crm-border bg-crm-panel p-2">
      <Select value={row.field} onChange={(e) => setField(e.target.value)} className="min-w-[10rem]">
        {LEAD_FILTER_FIELDS.length > 0 && (
          <optgroup label="Standard">
            {LEAD_FILTER_FIELDS.map((f) => (
              <option key={f.field} value={f.field}>
                {f.label}
              </option>
            ))}
          </optgroup>
        )}
        {extraFields.length > 0 && (
          <optgroup label="Custom">
            {extraFields.map((f) => (
              <option key={f.field} value={f.field}>
                {f.label}
              </option>
            ))}
          </optgroup>
        )}
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

      {!VALUELESS.has(row.operator) && def && <ValueInput row={row} def={def} onChange={onChange} />}

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
    const value = Array.isArray(row.value) ? row.value : row.value != null ? [row.value as string] : [];
    if (isMulti) {
      return (
        <select
          multiple
          className="crm-input min-w-[12rem]"
          value={value as string[]}
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
          value={typeof row.value === "number" || typeof row.value === "string" ? row.value : ""}
          onChange={(e) => onChange({ ...row, value: e.target.value === "" ? null : Number(e.target.value) })}
          className="w-32"
        />
        {between && (
          <>
            <span className="text-xs text-crm-muted">to</span>
            <Input
              type="number"
              value={typeof row.valueTo === "number" || typeof row.valueTo === "string" ? row.valueTo : ""}
              onChange={(e) => onChange({ ...row, valueTo: e.target.value === "" ? null : Number(e.target.value) })}
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

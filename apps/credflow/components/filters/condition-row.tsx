"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, Trash2, X } from "lucide-react";
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
   * declared type — used for fields like `ownerId` (the owner picker) whose
   * values aren't known at build time.
   */
  dynamicOptions?: Record<string, { value: string; label: string }[]>;
}

const VALUELESS = new Set<FilterOperator>(["isEmpty", "isNotEmpty", "isTrue", "isFalse"]);

/**
 * Relative date operators that carry their own meaning and need NO value input
 * (e.g. "today", "this week"). Treated like VALUELESS for rendering + the
 * modal's completeness check.
 */
export const RELATIVE_NO_VALUE_OPERATORS = new Set<FilterOperator>([
  "relToday",
  "relYesterday",
  "relTomorrow",
  "relThisWeek",
  "relLastWeek",
  "relNextWeek",
  "relThisMonth",
  "relLastMonth",
  "relThisYear",
  "relLastYear",
]);

/** Relative date operators that need a single integer N (number of days). */
export const RELATIVE_N_OPERATORS = new Set<FilterOperator>(["relLastNDays", "relNextNDays"]);

/** Merge in runtime options when the field has any — promotes type to "select". */
function applyDynamicOptions(
  def: FilterFieldDef | undefined,
  dynamicOptions: Record<string, { value: string; label: string }[]>,
): FilterFieldDef | undefined {
  if (!def) return def;
  const opts = dynamicOptions[def.field];
  if (!opts || opts.length === 0) return def;
  // Promote to a select so `in` / `notIn` + the ChipsMultiSelect become
  // available. Preserve any operators the catalog already declared, otherwise
  // fall back to the select defaults (which include in / notIn).
  return { ...def, type: "select", options: opts, operators: def.operators ?? DEFAULT_OPERATORS.select };
}

/**
 * Lazily fetch pickable VALUES for a filter field from /api/leads/field-values
 * (the same endpoint the value-picker uses elsewhere). Standard text columns
 * with an enumerable value set (e.g. `source` once it's mapped, or any capped
 * DB-distinct field) become a multiselect with in / notIn, instead of a bare
 * text box. Fields that resolve to free-text ({ source: "none" }) are cached as
 * [] and keep their normal text/date/number input. Module-level cache avoids
 * refetching the same field across rows / re-opens.
 */
const fieldValuesCache = new Map<string, { value: string; label: string }[]>();

type FieldValuesResponse =
  | { source: "pipeline" | "options" | "distinct"; values: { value: string; label: string }[] }
  | { source: "none"; values: null; reason?: string };

function useFetchedFieldOptions(field: string): Record<string, { value: string; label: string }[]> {
  const [options, setOptions] = useState<{ value: string; label: string }[] | null>(
    () => fieldValuesCache.get(field) ?? null,
  );

  useEffect(() => {
    let cancelled = false;
    if (!field) {
      setOptions(null);
      return;
    }
    const cached = fieldValuesCache.get(field);
    if (cached) {
      setOptions(cached);
      return;
    }
    setOptions(null);
    void fetch(`/api/leads/field-values?field=${encodeURIComponent(field)}`, { credentials: "include" })
      .then((r) => (r.ok ? (r.json() as Promise<FieldValuesResponse>) : null))
      .then((json) => {
        if (cancelled || !json) return;
        const list = json.source !== "none" && Array.isArray(json.values) ? json.values : [];
        fieldValuesCache.set(field, list);
        setOptions(list);
      })
      .catch(() => {
        if (!cancelled) {
          fieldValuesCache.set(field, []);
          setOptions([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [field]);

  return options && options.length > 0 ? { [field]: options } : {};
}

/** Uniform control height so field / operator / value line up. */
const CONTROL_H = "h-[38px]";

/** Small uppercase label sitting above each control (Field / Operator / Value). */
function ControlLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-crm-muted">
      {children}
    </span>
  );
}

/**
 * Field chooser (Build 3) — type-ahead combobox. The control itself is the
 * search input: click and type to filter. Results are grouped Standard / Custom.
 * Replaces the native <select> whose 30+ options were tedious to scroll and
 * whose option rows can't be spaced (a native-select limitation).
 */
function FieldPicker({
  value,
  standardFields,
  customFields,
  onChange,
}: {
  value: string;
  standardFields: FilterFieldDef[];
  customFields: FilterFieldDef[];
  onChange: (field: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const selectedLabel =
    [...standardFields, ...customFields].find((f) => f.field === value)?.label ?? "";

  const q = query.trim().toLowerCase();
  const matchStd = useMemo(
    () => (q ? standardFields.filter((f) => f.label.toLowerCase().includes(q)) : standardFields),
    [q, standardFields],
  );
  const matchCustom = useMemo(
    () => (q ? customFields.filter((f) => f.label.toLowerCase().includes(q)) : customFields),
    [q, customFields],
  );
  const noMatches = matchStd.length === 0 && matchCustom.length === 0;

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(field: string) {
    onChange(field);
    setOpen(false);
    setQuery("");
  }

  const optionRow =
    "flex w-full cursor-pointer items-center px-3 py-2.5 text-left text-sm text-crm-text hover:bg-crm-blue-soft";

  return (
    <div ref={rootRef} className="relative min-w-[12rem]">
      <div className="relative">
        {/* The input IS the trigger: shows the selected label until focused,
         * then becomes a live search box. */}
        <input
          value={open ? query : selectedLabel}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          placeholder="Select field"
          className={`crm-input w-full ${CONTROL_H} pr-8`}
        />
        <ChevronDown size={16} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-crm-muted" />
      </div>

      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-[16rem] overflow-hidden rounded-lg border border-crm-border bg-white shadow-crm-dropdown">
          {/* Grouped, scrollable results. ~9 rows visible before scroll. */}
          <div className="max-h-[22rem] overflow-y-auto py-1">
            {noMatches && (
              <div className="px-3 py-6 text-center text-sm text-crm-muted">No fields match “{query}”</div>
            )}
            {matchStd.length > 0 && (
              <>
                <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-crm-muted">
                  Standard
                </div>
                {matchStd.map((f) => (
                  <button
                    key={f.field}
                    type="button"
                    className={`${optionRow} ${f.field === value ? "bg-crm-blue-soft font-medium" : ""}`}
                    onClick={() => pick(f.field)}
                  >
                    {f.label}
                  </button>
                ))}
              </>
            )}
            {matchCustom.length > 0 && (
              <>
                <div className="mt-1 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-crm-muted">
                  Custom
                </div>
                {matchCustom.map((f) => (
                  <button
                    key={f.field}
                    type="button"
                    className={`${optionRow} ${f.field === value ? "bg-crm-blue-soft font-medium" : ""}`}
                    onClick={() => pick(f.field)}
                  >
                    {f.label}
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Multi-select value picker (Build 3) — chips when closed, popover when open.
 * Popover carries a search box, an "N selected / Clear" header, and a roomy
 * checkbox list. Replaces the native <select multiple> that required ctrl/cmd-
 * click. Closed height matches the other single-line controls so the row does
 * not jump when switching operator to `in` / `not in`.
 */
function ChipsMultiSelect({
  options,
  selected,
  onChange,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const sel = new Set(selected.map(String));
  const toggle = (v: string) => {
    const next = new Set(sel);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange([...next]);
  };
  const chosen = options.filter((o) => sel.has(String(o.value)));
  const q = query.trim().toLowerCase();
  const matches = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;

  return (
    <div ref={rootRef} className="relative min-w-[14rem]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`crm-input flex w-full flex-wrap items-center gap-1.5 ${chosen.length ? "min-h-[38px] py-1.5" : CONTROL_H}`}
      >
        {chosen.length === 0 && <span className="text-crm-muted">Select value</span>}
        {chosen.map((o) => (
          <span
            key={o.value}
            className="inline-flex items-center gap-1 rounded-md bg-crm-blue-soft px-2 py-0.5 text-[13px] text-crm-blue"
          >
            {o.label}
            <X
              size={12}
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                toggle(String(o.value));
              }}
            />
          </span>
        ))}
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-[18rem] overflow-hidden rounded-lg border border-crm-border bg-white shadow-crm-dropdown">
          <div className="border-b border-crm-border p-2">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-crm-muted" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search options…"
                className="crm-input w-full pl-8"
              />
            </div>
          </div>
          <div className="flex items-center justify-between border-b border-crm-border px-3 py-1.5 text-xs text-crm-muted">
            <span>{selected.length} selected</span>
            <div className="flex items-center gap-3">
              {/* Select-all unions the CURRENTLY VISIBLE matches into the
                * selection — so with an active search it selects just the
                * filtered subset the user sees, and with no search it selects
                * everything. Never clobbers existing picks. */}
              {matches.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const union = new Set(selected.map(String));
                    matches.forEach((o) => union.add(String(o.value)));
                    onChange([...union]);
                  }}
                  className="text-crm-blue hover:underline"
                >
                  Select all{query ? ` (${matches.length})` : ""}
                </button>
              )}
              {selected.length > 0 && (
                <button type="button" onClick={() => onChange([])} className="text-crm-blue hover:underline">
                  Clear
                </button>
              )}
            </div>
          </div>
          <div className="max-h-[18rem] overflow-y-auto">
            {matches.length === 0 && <div className="px-3 py-3 text-sm text-crm-muted">No options</div>}
            {matches.map((o) => (
              <label
                key={o.value}
                className="flex cursor-pointer items-center gap-2.5 px-3 py-2.5 text-sm text-crm-text hover:bg-crm-blue-soft"
              >
                <input
                  type="checkbox"
                  checked={sel.has(String(o.value))}
                  onChange={() => toggle(String(o.value))}
                  className="h-4 w-4 accent-crm-blue"
                />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
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
  // Lazily fetch real values for the selected field and merge them over the
  // caller-supplied dynamicOptions (caller options win). This promotes standard
  // enumerable columns (e.g. source) to a multiselect with in / notIn.
  const fetchedOptions = useFetchedFieldOptions(row.field);
  const mergedOptions = { ...fetchedOptions, ...dynamicOptions };
  const def = applyDynamicOptions(rawDef, mergedOptions);
  const operators = def?.operators ?? (def ? DEFAULT_OPERATORS[def.type] : []);

  function setField(name: string) {
    const rawNewDef = allFields.find((f) => f.field === name);
    const newDef = applyDynamicOptions(rawNewDef, mergedOptions);
    const newOp = (newDef?.operators ?? (newDef ? DEFAULT_OPERATORS[newDef.type] : []))[0] ?? "eq";
    onChange({ field: name, operator: newOp, value: undefined, valueTo: undefined });
  }

  function setOperator(op: FilterOperator) {
    onChange({ ...row, operator: op, value: VALUELESS.has(op) ? undefined : row.value });
  }

  const showValue =
    !VALUELESS.has(row.operator) && !RELATIVE_NO_VALUE_OPERATORS.has(row.operator) && def;

  return (
    <div className="flex flex-wrap items-start gap-3 rounded-lg border border-crm-border bg-crm-panel p-3">
      <div>
        <ControlLabel>Field</ControlLabel>
        <FieldPicker
          value={row.field}
          standardFields={LEAD_FILTER_FIELDS}
          customFields={extraFields}
          onChange={setField}
        />
      </div>

      <div>
        <ControlLabel>Operator</ControlLabel>
        <Select
          value={row.operator}
          onChange={(e) => setOperator(e.target.value as FilterOperator)}
          className={`${CONTROL_H} min-w-[9rem]`}
        >
          {operators.map((op) => (
            <option key={op} value={op}>
              {OPERATOR_LABEL[op]}
            </option>
          ))}
        </Select>
      </div>

      {showValue && (
        <div>
          <ControlLabel>Value</ControlLabel>
          <ValueInput row={row} def={def} onChange={onChange} />
        </div>
      )}

      <button
        onClick={onRemove}
        className="ml-auto mt-[22px] rounded-md p-2 text-crm-muted hover:bg-white hover:text-red-600"
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
        <ChipsMultiSelect
          options={def.options ?? []}
          selected={(value as string[]).map(String)}
          onChange={(next) => onChange({ ...row, value: next })}
        />
      );
    }
    return (
      <Select
        value={String(row.value ?? "")}
        onChange={(e) => onChange({ ...row, value: e.target.value })}
        className={`${CONTROL_H} min-w-[10rem]`}
      >
        <option value="">Select value</option>
        {def.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    );
  }

  if (def.type === "date") {
    // Relative "N days" operators — a single integer input, no date picker.
    if (RELATIVE_N_OPERATORS.has(row.operator)) {
      return (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            placeholder="N"
            value={typeof row.value === "number" || typeof row.value === "string" ? row.value : ""}
            onChange={(e) => onChange({ ...row, value: e.target.value === "" ? null : Number(e.target.value) })}
            className={`${CONTROL_H} w-24`}
          />
          <span className="text-xs text-crm-muted">days</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2">
        <Input
          type="date"
          value={typeof row.value === "string" ? row.value : ""}
          onChange={(e) => onChange({ ...row, value: e.target.value })}
          className={`${CONTROL_H} min-w-[10rem]`}
        />
        {between && (
          <>
            <span className="text-xs text-crm-muted">to</span>
            <Input
              type="date"
              value={typeof row.valueTo === "string" ? row.valueTo : ""}
              onChange={(e) => onChange({ ...row, valueTo: e.target.value })}
              className={`${CONTROL_H} min-w-[10rem]`}
            />
          </>
        )}
      </div>
    );
  }

  if (def.type === "number") {
    return (
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={typeof row.value === "number" || typeof row.value === "string" ? row.value : ""}
          onChange={(e) => onChange({ ...row, value: e.target.value === "" ? null : Number(e.target.value) })}
          className={`${CONTROL_H} w-32`}
        />
        {between && (
          <>
            <span className="text-xs text-crm-muted">to</span>
            <Input
              type="number"
              value={typeof row.valueTo === "number" || typeof row.valueTo === "string" ? row.valueTo : ""}
              onChange={(e) => onChange({ ...row, valueTo: e.target.value === "" ? null : Number(e.target.value) })}
              className={`${CONTROL_H} w-32`}
            />
          </>
        )}
      </div>
    );
  }

  return (
    <Input
      type="text"
      placeholder="Enter value"
      value={typeof row.value === "string" ? row.value : ""}
      onChange={(e) => onChange({ ...row, value: e.target.value })}
      className={`${CONTROL_H} min-w-[12rem]`}
    />
  );
}
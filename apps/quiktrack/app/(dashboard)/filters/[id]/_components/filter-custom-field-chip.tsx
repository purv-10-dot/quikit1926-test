"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import type { CustomFieldDTO } from "@/lib/services/customFields";
import type { CustomFilter } from "@/lib/customFields/filterQuery";
import type { FilterOperator } from "@/lib/customFields/registry";
import { ActiveChip } from "./filter-toolbar-parts";

interface MemberUser {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
}
interface MembersResponse {
  success: boolean;
  data?: { members?: { userId: string; user: MemberUser | null }[] };
}
interface OptionLite {
  value: string;
  label: string;
}

/** Whether the field is chosen from a fixed/looked-up option list. */
function isOptionField(type: string): boolean {
  return (
    type === "DROPDOWN_SINGLE" ||
    type === "DROPDOWN_MULTI" ||
    type === "USER_PICKER" ||
    type === "USER_PICKER_MULTI"
  );
}
function isMultiField(type: string): boolean {
  return type === "DROPDOWN_MULTI" || type === "USER_PICKER_MULTI";
}
/** Free-input fields: a text/number box + Update button (like Jira). */
function isNumberField(type: string): boolean {
  return type === "NUMBER";
}
function isTextField(type: string): boolean {
  return type === "SHORT_TEXT" || type === "LONG_TEXT" || type === "URL";
}
function isInputField(type: string): boolean {
  return isNumberField(type) || isTextField(type);
}

/**
 * Field types the saved-filters "More filters" picker offers. Broader than the
 * shared Backlog/Board set — it also includes NUMBER and text/URL fields, which
 * filter via a free-input chip. Kept local so the shared component (and the
 * Backlog) is unaffected.
 */
export function isSavedFilterField(field: { type: string }): boolean {
  return (
    isOptionField(field.type) ||
    field.type === "CHECKBOX" ||
    field.type === "DATE" ||
    isInputField(field.type)
  );
}

/** The operators the chip's dropdown offers, per field family. */
function operatorsFor(type: string): { op: FilterOperator; label: string }[] {
  if (type === "CHECKBOX") {
    return [
      { op: "is_true", label: "is checked" },
      { op: "is_false", label: "is unchecked" },
    ];
  }
  if (isNumberField(type)) {
    return [
      { op: "eq", label: "= (equals)" },
      { op: "neq", label: "!= (not equals)" },
      { op: "lt", label: "< (less than)" },
      { op: "gt", label: "> (greater than)" },
    ];
  }
  if (isTextField(type)) {
    return [
      { op: "contains", label: "contains" },
      { op: "equals", label: "= (equals)" },
    ];
  }
  if (isMultiField(type)) {
    // Multi-value fields store a JSON array; the backend expresses "contains any"
    // (has_any) but has no negated JSON form, so only "= (equals)" is offered.
    return [{ op: "has_any", label: "= (equals)" }];
  }
  // DROPDOWN_SINGLE / USER_PICKER (and date fallback)
  return [
    { op: type === "USER_PICKER" ? "is" : "in", label: "= (equals)" },
    { op: type === "USER_PICKER" ? "is_not" : "not_in", label: "!= (not equals)" },
  ];
}

function valuesOf(filter: CustomFilter | undefined): string[] {
  if (!filter) return [];
  const v = filter.value;
  if (Array.isArray(v)) return v.map(String);
  if (v === undefined || v === null || v === "") return [];
  return [String(v)];
}

/** Chip-face value summary. */
function summarize(field: CustomFieldDTO, options: OptionLite[], filter: CustomFilter | undefined): string {
  if (field.type === "CHECKBOX") return filter?.op === "is_false" ? "Unchecked" : "Checked";
  if (isInputField(field.type)) {
    const v = filter?.value;
    return v === undefined || v === null || v === "" ? "Any" : String(v);
  }
  const vals = valuesOf(filter);
  if (vals.length === 0) return "Any";
  const labels = vals.map((val) => options.find((o) => o.value === val)?.label ?? val);
  return labels.length <= 2 ? labels.join(", ") : `${labels.length} selected`;
}

/** Custom operator dropdown (= / !=) matching the Jira picker look. */
function OperatorDropdown({
  fieldName,
  operators,
  value,
  onChange,
}: {
  fieldName: string;
  operators: { op: FilterOperator; label: string }[];
  value: FilterOperator;
  onChange: (op: FilterOperator) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const currentLabel = operators.find((o) => o.op === value)?.label ?? operators[0]?.label ?? "";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full h-8 px-2.5 text-sm border border-gray-300 rounded bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-400"
      >
        <span className="truncate">
          {fieldName} {currentLabel}
        </span>
        <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-40 top-full mt-1 left-0 w-full bg-white border border-gray-200 rounded-lg shadow-xl py-1">
          {operators.map((o) => (
            <button
              key={o.op}
              type="button"
              onClick={() => {
                onChange(o.op);
                setOpen(false);
              }}
              className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-blue-50 ${
                o.op === value ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700"
              }`}
            >
              <span className="flex-1 truncate">{o.label}</span>
              {o.op === value && <Check className="h-3.5 w-3.5 text-blue-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Free-input value control for NUMBER / text / URL fields — an input, inline
 * validation, and an "Update" button (matching Jira's number-filter popover).
 */
function InputFilter({
  isNumber,
  initial,
  onApply,
}: {
  isNumber: boolean;
  initial: string;
  onApply: (value: string) => void;
}) {
  const [val, setVal] = useState(initial);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    setVal(initial);
    setTouched(false);
  }, [initial]);

  const trimmed = val.trim();
  const invalidNumber = isNumber && trimmed !== "" && Number.isNaN(Number(trimmed));
  const canUpdate = trimmed !== "" && !invalidNumber;

  return (
    <div className="p-2">
      <input
        autoFocus
        type="text"
        inputMode={isNumber ? "decimal" : "text"}
        value={val}
        onChange={(e) => {
          setVal(e.target.value);
          setTouched(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && canUpdate) onApply(trimmed);
        }}
        placeholder={isNumber ? "Enter a number" : "Enter text"}
        className={`w-full h-9 px-2.5 text-sm border rounded focus:outline-none focus:ring-1 ${
          invalidNumber
            ? "border-red-400 focus:ring-red-400"
            : "border-gray-300 focus:ring-blue-400"
        }`}
      />
      {invalidNumber && touched && (
        <p className="mt-1.5 flex items-center gap-1 text-[12px] text-red-600">
          <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-100 text-red-600 text-[10px] font-bold">!</span>
          Please enter a valid number
        </p>
      )}
      <button
        type="button"
        disabled={!canUpdate}
        onClick={() => onApply(trimmed)}
        className="mt-2.5 h-8 px-4 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400"
      >
        Update
      </button>
    </div>
  );
}

/**
 * Active filter chip for one enabled custom field — Jira-style. The chip face is
 * `Name = value ▾ ✕`; the popover has an operator selector (= / !=), a search
 * box, a checkbox list of values, and an "N of M" count. Emits a `CustomFilter`
 * the backend consumes.
 */
export function CustomFieldChip({
  field,
  projectId,
  filters,
  onFiltersChange,
  onRemove,
}: {
  field: CustomFieldDTO;
  projectId?: string;
  filters: CustomFilter[];
  onFiltersChange: (next: CustomFilter[]) => void;
  onRemove: () => void;
}) {
  const [members, setMembers] = useState<OptionLite[]>([]);
  const [q, setQ] = useState("");
  const needsMembers = field.type === "USER_PICKER" || field.type === "USER_PICKER_MULTI";

  useEffect(() => {
    if (!needsMembers || !projectId) return;
    let alive = true;
    fetch(`/api/projects/${projectId}/members`)
      .then((r) => r.json())
      .then((m: MembersResponse) => {
        if (!alive) return;
        setMembers(
          (m?.data?.members ?? [])
            .map((x) => x.user)
            .filter((u): u is MemberUser => !!u)
            .map((u) => ({
              value: u.id,
              label: [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email,
            })),
        );
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [needsMembers, projectId]);

  const options: OptionLite[] = useMemo(
    () =>
      needsMembers
        ? members
        : field.options.filter((o) => o.isActive).map((o) => ({ value: o.value, label: o.label })),
    [needsMembers, members, field.options],
  );

  const current = filters.find((f) => f.fieldId === field.id);
  const others = filters.filter((f) => f.fieldId !== field.id);
  const operators = operatorsFor(field.type);
  const currentOp = current?.op ?? operators[0]!.op;

  const commit = (op: FilterOperator, value: unknown) => {
    const blank =
      value === "" || value === null || value === undefined || (Array.isArray(value) && value.length === 0);
    // For CHECKBOX the op itself carries meaning (no value needed).
    if (field.type === "CHECKBOX") {
      onFiltersChange([...others, { fieldId: field.id, type: field.type, op }]);
      return;
    }
    if (blank) {
      onFiltersChange(others);
      return;
    }
    onFiltersChange([...others, { fieldId: field.id, type: field.type, op, value }]);
  };

  const selected = new Set(valuesOf(current));
  const toggleValue = (val: string) => {
    if (isMultiField(field.type) || field.type === "DROPDOWN_SINGLE" || field.type === "USER_PICKER") {
      // Single-select fields still store an array (backend `in` accepts it),
      // matching the Jira multi-check UX; single fields keep at most one.
      const multi = isMultiField(field.type);
      const next = new Set(selected);
      if (next.has(val)) next.delete(val);
      else {
        if (!multi) next.clear();
        next.add(val);
      }
      commit(currentOp, Array.from(next));
    }
  };

  const filteredOptions = useMemo(() => {
    const query = q.trim().toLowerCase();
    return query ? options.filter((o) => o.label.toLowerCase().includes(query)) : options;
  }, [options, q]);

  return (
    <ActiveChip
      label={field.name}
      op="="
      value={summarize(field, options, current)}
      onClear={onRemove}
      renderValueMenu={() => (
        <div className="w-64">
          {/* Operator selector (= / !=) */}
          <div className="px-2 pt-2 pb-1.5 border-b border-gray-100">
            <OperatorDropdown
              fieldName={field.name}
              operators={operators}
              value={currentOp}
              onChange={(op) => commit(op, current?.value)}
            />
          </div>

          {field.type === "CHECKBOX" ? (
            <div className="px-3 py-2 text-xs text-gray-500">
              Filtering issues where “{field.name}” {currentOp === "is_false" ? "is unchecked" : "is checked"}.
            </div>
          ) : isOptionField(field.type) ? (
            <>
              <div className="px-2 pt-2 pb-1.5">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <input
                    autoFocus
                    type="text"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={`Search ${field.name}`}
                    className="w-full pl-7 pr-2 h-8 text-sm border border-blue-400 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
              </div>
              <div className="max-h-56 overflow-y-auto pb-1">
                {filteredOptions.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-gray-400">No options</div>
                ) : (
                  filteredOptions.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => toggleValue(o.value)}
                      className="flex items-center gap-2.5 w-full px-3 py-1.5 text-sm text-left hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(o.value)}
                        readOnly
                        className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 pointer-events-none"
                      />
                      <span className="truncate text-gray-800">{o.label}</span>
                    </button>
                  ))
                )}
              </div>
              <div className="flex justify-end px-3 py-1.5 border-t border-gray-100 text-[11px] text-gray-400">
                {filteredOptions.length} of {options.length}
              </div>
            </>
          ) : field.type === "DATE" ? (
            <div className="px-2 py-2">
              <input
                type="date"
                value={typeof current?.value === "string" ? current.value : ""}
                onChange={(e) => commit(currentOp, e.target.value)}
                className="w-full h-8 px-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
          ) : isInputField(field.type) ? (
            <InputFilter
              isNumber={isNumberField(field.type)}
              initial={current?.value === undefined || current?.value === null ? "" : String(current.value)}
              onApply={(val) =>
                commit(currentOp, isNumberField(field.type) ? Number(val) : val)
              }
            />
          ) : null}
        </div>
      )}
    />
  );
}

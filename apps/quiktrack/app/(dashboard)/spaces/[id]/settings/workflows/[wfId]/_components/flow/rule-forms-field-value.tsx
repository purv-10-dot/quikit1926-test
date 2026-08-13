"use client";

import { PortalDropdown, type DropdownOption } from "./portal-dropdown";
import { DatePickerInput } from "./date-picker-input";
import {
  FIELD_OPTIONS,
  fieldKind,
  REFERENCE_FIELDS,
  PRIORITY_OPTIONS,
  TYPE_OPTIONS,
} from "./restrict-options";

/** People/statuses/resolutions the value dropdown resolves reference fields to. */
export interface FieldValueOptions {
  members: { userId: string; name: string }[];
  statuses: { id: string; name: string }[];
  resolutions: { id: string; name: string }[];
}

/* ── "Restrict to when a field is a specific value" config form ──────────── */
// The "Review its value as", "Check if it" operators, and the value input all
// depend on the chosen field's KIND (text / number / date).

const TEXT_VALUE_AS: DropdownOption[] = [{ value: "text", label: "Text" }];
const SELECTION_VALUE_AS: DropdownOption[] = [{ value: "selection", label: "A selection" }];
const NUMBER_VALUE_AS: DropdownOption[] = [{ value: "number", label: "A number" }];
const DATE_VALUE_AS: DropdownOption[] = [
  { value: "datetime", label: "Date with time" },
  { value: "date", label: "Date without time" },
];

const EQ_OPS: DropdownOption[] = [
  { value: "eq", label: "Equals" },
  { value: "neq", label: "Doesn't equal" },
];
const DATE_OPS: DropdownOption[] = [
  { value: "eq", label: "Equals" },
  { value: "after", label: "Is after" },
  { value: "aftereq", label: "Is or is after" },
  { value: "before", label: "Is before" },
  { value: "beforeeq", label: "Is or is before" },
  { value: "neq", label: "Doesn't equal" },
];

const DATE_OP_VALUES = DATE_OPS.map((o) => o.value);

export function isRestrictFieldValueValid(config: Record<string, unknown>): boolean {
  const field = String(config.field ?? "");
  const kind = fieldKind(field);
  if (!kind) return false;
  const op = String(config.op ?? "");
  const okOp = kind === "date" ? DATE_OP_VALUES.includes(op) : op === "eq" || op === "neq";
  if (!okOp) return false;
  return String(config.value ?? "").trim().length > 0;
}

/**
 * The "value as" + operators + default the form offers for a field. Reference
 * fields (Assignee, Priority, Status…) show "A selection"; free-text fields show
 * "Text"; numbers "A number"; dates the date pair.
 */
function controlsFor(field: string, kind: "text" | "number" | "date") {
  if (kind === "number") return { valueAs: NUMBER_VALUE_AS, ops: EQ_OPS, defaultValueAs: "number" };
  if (kind === "date") return { valueAs: DATE_VALUE_AS, ops: DATE_OPS, defaultValueAs: "datetime" };
  if (REFERENCE_FIELDS[field]) return { valueAs: SELECTION_VALUE_AS, ops: EQ_OPS, defaultValueAs: "selection" };
  return { valueAs: TEXT_VALUE_AS, ops: EQ_OPS, defaultValueAs: "text" };
}

/** Resolve the dropdown options for a reference field (users/statuses/etc.). */
function referenceOptions(field: string, opts: FieldValueOptions): DropdownOption[] | null {
  const ref = REFERENCE_FIELDS[field];
  if (!ref) return null;
  if (ref === "users") return opts.members.map((m) => ({ value: m.userId, label: m.name }));
  if (ref === "statuses") return opts.statuses.map((s) => ({ value: s.id, label: s.name }));
  if (ref === "resolutions") return opts.resolutions.map((r) => ({ value: r.id, label: r.name }));
  if (ref === "priority") return PRIORITY_OPTIONS;
  if (ref === "type") return TYPE_OPTIONS;
  return null;
}

export function RestrictFieldValueForm({
  value,
  onChange,
  options,
}: {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  options: FieldValueOptions;
}) {
  const field = String(value.field ?? "");
  const kind = fieldKind(field);
  const op = String(value.op ?? "");
  const val = String(value.value ?? "");
  const set = (patch: Record<string, unknown>) => onChange({ ...value, ...patch });
  const refOpts = referenceOptions(field, options);

  // Selecting a field resets the downstream controls to that kind's defaults.
  const pickField = (next: string) => {
    const k = fieldKind(next);
    const c = k ? controlsFor(next, k) : null;
    onChange({ field: next, valueAs: c?.defaultValueAs ?? "text", op: "", value: "", time: undefined });
  };

  const c = kind ? controlsFor(field, kind) : null;
  const valueAs = String(value.valueAs ?? c?.defaultValueAs ?? "text");
  const withTime = kind === "date" && valueAs === "datetime";

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">For this field</label>
        <PortalDropdown
          placeholder="Choose a field"
          options={FIELD_OPTIONS.map((f) => ({ value: f.value, label: f.label }))}
          selected={field ? [field] : []}
          onChange={(next) => pickField(next[0] ?? "")}
        />
      </div>

      {kind && c && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Review its value as</label>
              <PortalDropdown
                options={c.valueAs}
                selected={[valueAs]}
                onChange={(next) => set({ valueAs: next[0] ?? c.defaultValueAs })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Check if it</label>
              <PortalDropdown
                placeholder="Choose an option"
                options={c.ops}
                selected={op ? [op] : []}
                onChange={(next) => set({ op: next[0] ?? "" })}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">This value</label>
            {refOpts ? (
              <PortalDropdown
                placeholder={REFERENCE_FIELDS[field] === "users" ? "Select people" : "Select a value"}
                options={refOpts}
                selected={val ? [val] : []}
                onChange={(next) => set({ value: next[0] ?? "" })}
              />
            ) : kind === "number" ? (
              <input
                type="number"
                value={val}
                onChange={(e) => set({ value: e.target.value })}
                placeholder="Enter a number"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
              />
            ) : kind === "date" ? (
              <DatePickerInput
                date={val}
                time={value.time ? String(value.time) : ""}
                withTime={withTime}
                onChange={(d, t) => set({ value: d, time: withTime ? t : undefined })}
              />
            ) : (
              <textarea
                value={val}
                onChange={(e) => set({ value: e.target.value })}
                placeholder="Enter some text"
                rows={4}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

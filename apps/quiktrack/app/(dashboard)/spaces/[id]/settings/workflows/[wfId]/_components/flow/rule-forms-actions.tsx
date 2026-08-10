"use client";

import { PortalDropdown, type DropdownOption } from "./portal-dropdown";
import { DatePickerInput } from "./date-picker-input";
import { FIELD_OPTIONS, fieldKind } from "./restrict-options";

/** Fields a post-function can WRITE (excludes read-only type/status). */
const WRITABLE_FIELDS = FIELD_OPTIONS.filter((f) => f.value !== "type" && f.value !== "status");
const WRITABLE_KEYS = new Set(WRITABLE_FIELDS.map((f) => f.value));

/* ── "Assign a work item" ────────────────────────────────────────────────── */

const ASSIGN_TOKENS: DropdownOption[] = [
  { value: "actor", label: "Current user" },
  { value: "owner", label: "Space owner" },
  { value: "reporter", label: "Reporter" },
];

export function isAssignValid(config: Record<string, unknown>): boolean {
  return String(config.to ?? "").trim().length > 0;
}

export function AssignForm({
  value,
  onChange,
  members,
}: {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  members: { userId: string; name: string }[];
}) {
  const to = String(value.to ?? "");
  const remove = to === "unassigned";
  const set = (patch: Record<string, unknown>) => onChange({ ...value, ...patch });
  const options = [...ASSIGN_TOKENS, ...members.map((m) => ({ value: m.userId, label: m.name }))];

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">Assign to</label>
        {remove ? (
          <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-400">
            Unassigned (assignee will be removed)
          </div>
        ) : (
          <PortalDropdown
            placeholder="Choose a person"
            options={options}
            selected={to ? [to] : []}
            onChange={(next) => set({ to: next[0] ?? "" })}
          />
        )}
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-800">
        <input
          type="checkbox"
          checked={remove}
          onChange={(e) => set({ to: e.target.checked ? "unassigned" : "" })}
          className="text-accent-600 focus:ring-accent-500"
        />
        Remove assignee
      </label>
    </div>
  );
}

/* ── "Copy the value of one field to another" ────────────────────────────── */

const COPY_SOURCES: DropdownOption[] = [
  { value: "self", label: "within the same work item" },
  { value: "parent", label: "the parent work item" },
];

export function isCopyFieldValid(config: Record<string, unknown>): boolean {
  return WRITABLE_KEYS.has(String(config.from ?? "")) && WRITABLE_KEYS.has(String(config.to ?? ""));
}

export function CopyFieldForm({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const source = String(value.source ?? "self");
  const from = String(value.from ?? "");
  const to = String(value.to ?? "");
  const set = (patch: Record<string, unknown>) => onChange({ ...value, ...patch });
  const opts = WRITABLE_FIELDS.map((f) => ({ value: f.value, label: f.label }));

  return (
    <div className="space-y-4">
      <div className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">
        We&apos;ll skip this rule for work items that don&apos;t have both your selected fields.
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">Copy a field from</label>
        <PortalDropdown
          options={COPY_SOURCES}
          selected={[source]}
          onChange={(next) => set({ source: next[0] ?? "self" })}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Copy from this field</label>
          <PortalDropdown placeholder="Select a field" options={opts} selected={from ? [from] : []} onChange={(n) => set({ from: n[0] ?? "" })} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">To this field</label>
          <PortalDropdown placeholder="Select a field to copy to" options={opts} selected={to ? [to] : []} onChange={(n) => set({ to: n[0] ?? "" })} />
        </div>
      </div>
      {to && <p className="text-[11px] text-gray-500">This field&apos;s value will replace the destination field&apos;s value.</p>}
    </div>
  );
}

/* ── "Update a work item field" ──────────────────────────────────────────── */

export function isUpdateFieldValid(config: Record<string, unknown>): boolean {
  if (!WRITABLE_KEYS.has(String(config.field ?? ""))) return false;
  if (config.clear === true) return true;
  return String(config.value ?? "").trim().length > 0;
}

export function UpdateFieldForm({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const field = String(value.field ?? "");
  const kind = fieldKind(field);
  const clear = value.clear === true;
  const mode = String(value.mode ?? "add");
  const val = String(value.value ?? "");
  const set = (patch: Record<string, unknown>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">Update this field</label>
        <PortalDropdown
          placeholder="Choose a field"
          options={WRITABLE_FIELDS.map((f) => ({ value: f.value, label: f.label }))}
          selected={field ? [field] : []}
          onChange={(next) => set({ field: next[0] ?? "", value: "", clear: false })}
        />
      </div>

      {field && !clear && (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">With this value</label>
            {kind === "number" ? (
              <input type="number" value={val} onChange={(e) => set({ value: e.target.value })} placeholder="Enter a number" className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none" />
            ) : kind === "date" ? (
              <DatePickerInput date={val} time="" onChange={(d) => set({ value: d })} />
            ) : (
              <input value={val} onChange={(e) => set({ value: e.target.value })} placeholder="Enter text here" className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none" />
            )}
          </div>
          {kind === "text" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">In this way</label>
              <div className="space-y-1.5">
                {[
                  { value: "add", label: "Add to the existing text in the field" },
                  { value: "replace", label: "Replace everything in the field with this value" },
                ].map((o) => (
                  <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm text-gray-800">
                    <input type="radio" name="update-field-mode" checked={mode === o.value} onChange={() => set({ mode: o.value })} className="text-accent-600 focus:ring-accent-500" />
                    {o.label}
                  </label>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {field && (
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-800">
          <input type="checkbox" checked={clear} onChange={(e) => set({ clear: e.target.checked, value: "" })} className="text-accent-600 focus:ring-accent-500" />
          Clear this field
        </label>
      )}
    </div>
  );
}

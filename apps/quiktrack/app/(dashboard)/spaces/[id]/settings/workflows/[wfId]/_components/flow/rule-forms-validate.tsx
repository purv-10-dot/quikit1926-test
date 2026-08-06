"use client";

import { PortalDropdown, type DropdownOption } from "./portal-dropdown";
import { statusPill } from "./rule-forms-status";
import {
  FIELD_OPTIONS,
  fieldOption,
  PERMISSION_OPTIONS,
  permissionKey,
} from "./restrict-options";

type Statuses = { id: string; name: string; category: string }[];

/* ── "Validate a field" ──────────────────────────────────────────────────── */

const FIELD_CHECKS: DropdownOption[] = [
  { value: "single_value", label: "Has a single value" },
  { value: "not_empty", label: "Isn't empty" },
  { value: "compares_date", label: "Compares to another date" },
  { value: "modified", label: "Has been modified" },
  { value: "regex", label: "Matches regular expression" },
];
const DATE_FIELD_OPTIONS = FIELD_OPTIONS.filter((f) => f.kind === "date");

export function isValidateFieldValid(config: Record<string, unknown>): boolean {
  if (!fieldOption(String(config.field ?? ""))) return false;
  const check = String(config.check ?? "");
  if (!FIELD_CHECKS.some((c) => c.value === check)) return false;
  if (check === "regex") return String(config.pattern ?? "").trim().length > 0;
  if (check === "compares_date") return DATE_FIELD_OPTIONS.some((f) => f.value === config.otherField);
  return true;
}

export function ValidateFieldForm({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const field = String(value.field ?? "");
  const check = String(value.check ?? "");
  const set = (patch: Record<string, unknown>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">Validate that field</label>
        <PortalDropdown
          placeholder="Choose a field"
          options={FIELD_OPTIONS.map((f) => ({ value: f.value, label: f.label }))}
          selected={field ? [field] : []}
          onChange={(next) => set({ field: next[0] ?? "", check: "", pattern: "", otherField: "" })}
        />
      </div>
      {field && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Check that it</label>
          <PortalDropdown
            placeholder="Choose an option"
            options={FIELD_CHECKS}
            selected={check ? [check] : []}
            onChange={(next) => set({ check: next[0] ?? "" })}
          />
        </div>
      )}
      {check === "regex" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Regular expression</label>
          <input
            value={String(value.pattern ?? "")}
            onChange={(e) => set({ pattern: e.target.value })}
            placeholder="e.g. ^[A-Z]{2,}$"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
          />
        </div>
      )}
      {check === "compares_date" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Is on or before this date field</label>
          <PortalDropdown
            placeholder="Choose a date field"
            options={DATE_FIELD_OPTIONS.map((f) => ({ value: f.value, label: f.label }))}
            selected={value.otherField ? [String(value.otherField)] : []}
            onChange={(next) => set({ otherField: next[0] ?? "" })}
          />
        </div>
      )}
    </div>
  );
}

/* ── "Validate that a work item has been through a status" ───────────────── */

export function isValidateBeenThroughValid(config: Record<string, unknown>): boolean {
  return Array.isArray(config.statusIds) && config.statusIds.length > 0;
}

export function ValidateBeenThroughForm({
  value,
  onChange,
  statuses,
}: {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  statuses: Statuses;
}) {
  const selected = Array.isArray(value.statusIds) ? (value.statusIds as string[]) : [];
  const set = (patch: Record<string, unknown>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">
          Check that the work item has had this status
        </label>
        <PortalDropdown
          usePills
          placeholder="Select a status"
          options={statuses.map((s) => ({ value: s.id, label: s.name, pill: statusPill(s.category) }))}
          selected={selected}
          onChange={(next) => set({ statusIds: next })}
        />
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-800">
        <input
          type="checkbox"
          checked={value.mostRecentOnly === true}
          onChange={(e) => set({ mostRecentOnly: e.target.checked })}
          className="text-accent-600 focus:ring-accent-500"
        />
        Only check the most recent status
      </label>
    </div>
  );
}

/* ── "Validate that parent work items are in a specific status" ──────────── */

export function isValidateParentValid(config: Record<string, unknown>): boolean {
  return Array.isArray(config.statusIds) && config.statusIds.length > 0;
}

export function ValidateParentStatusForm({
  value,
  onChange,
  statuses,
}: {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  statuses: Statuses;
}) {
  const selected = Array.isArray(value.statusIds) ? (value.statusIds as string[]) : [];
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-700">Check that the parent work items are in</label>
      <PortalDropdown
        multiple
        usePills
        placeholder="Select a status"
        options={statuses.map((s) => ({ value: s.id, label: s.name, pill: statusPill(s.category) }))}
        selected={selected}
        onChange={(next) => onChange({ ...value, statusIds: next })}
      />
    </div>
  );
}

/* ── "Show a screen" (Request input) ─────────────────────────────────────── */
// Placeholder: QuikTrack has no "screens" feature yet, so the picker is empty.
// The rule + bucket exist so the UI matches Jira; wire real screen options here
// once the screens data source is available. config: { screenId }

export function isShowScreenValid(config: Record<string, unknown>): boolean {
  return String(config.screenId ?? "").trim().length > 0;
}

export function ShowScreenForm({
  value,
  onChange,
  screens = [],
}: {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  screens?: { id: string; name: string }[];
}) {
  const selected = String(value.screenId ?? "");
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-700">Select a screen</label>
      <PortalDropdown
        placeholder="Choose a screen to display"
        options={screens.map((s) => ({ value: s.id, label: s.name }))}
        selected={selected ? [selected] : []}
        onChange={(next) => onChange({ ...value, screenId: next[0] ?? "" })}
      />
      {screens.length === 0 && (
        <p className="mt-1.5 text-[11px] text-gray-400">
          No screens are configured yet.
        </p>
      )}
    </div>
  );
}

/* ── "Validate that people have a specific permission" ───────────────────── */

export function isValidatePermissionValid(config: Record<string, unknown>): boolean {
  return Boolean(config.resource) && Boolean(config.action);
}

export function ValidatePermissionForm({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const current = value.resource && value.action
    ? permissionKey({ resource: String(value.resource), action: String(value.action) })
    : "";
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-700">Check for this permission</label>
      <PortalDropdown
        placeholder="Select permission"
        options={PERMISSION_OPTIONS.map((p) => ({ value: p.key, label: p.label }))}
        selected={current ? [current] : []}
        onChange={(next) => {
          const opt = PERMISSION_OPTIONS.find((p) => p.key === next[0]);
          onChange({ ...value, resource: opt?.resource ?? "", action: opt?.action ?? "" });
        }}
      />
    </div>
  );
}

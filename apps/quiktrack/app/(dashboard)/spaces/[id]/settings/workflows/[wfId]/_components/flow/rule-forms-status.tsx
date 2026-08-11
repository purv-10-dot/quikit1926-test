"use client";

import { PortalDropdown } from "./portal-dropdown";

/** Status category → pill classes. Shared by the status-based config forms. */
export function statusPill(category?: string): string {
  if (category === "IN_PROGRESS") return "bg-blue-100 text-blue-800";
  if (category === "DONE") return "bg-green-100 text-green-800";
  return "bg-gray-100 text-gray-700";
}

/* ── "Restrict based on the status of subtasks" config form ──────────────── */

export function SubtaskStatusForm({
  value,
  onChange,
  statuses,
}: {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  statuses: { id: string; name: string; category: string }[];
}) {
  const selected = Array.isArray(value.statusIds) ? (value.statusIds as string[]) : [];

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-700">Check that subtasks are in</label>
      <PortalDropdown
        multiple
        usePills
        placeholder="Select a status"
        options={statuses.map((s) => ({ value: s.id, label: s.name, pill: statusPill(s.category) }))}
        selected={selected}
        onChange={(next) => onChange({ ...value, statusIds: next })}
      />
      <p className="mt-1.5 text-[11px] text-gray-500">
        The transition is allowed only when every subtask is in one of the selected statuses.
      </p>
    </div>
  );
}

/* ── "Restrict to when a work item has been through a status" config form ── */

/** A labelled checkbox with an optional description line. */
function CheckboxRow({
  checked,
  onChange,
  label,
  description,
  indent,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  indent?: boolean;
}) {
  return (
    <label className={`flex cursor-pointer gap-2 ${indent ? "ml-6" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 text-accent-600 focus:ring-accent-500"
      />
      <span>
        <span className="block text-sm text-gray-800">{label}</span>
        {description && <span className="block text-[11px] text-gray-500">{description}</span>}
      </span>
    </label>
  );
}

export function isBeenThroughStatusValid(config: Record<string, unknown>): boolean {
  return Array.isArray(config.statusIds) && config.statusIds.length > 0;
}

/* ── "Restrict users who have previously updated a status" config form ────── */

export function isPreviousUpdaterValid(config: Record<string, unknown>): boolean {
  return String(config.toStatusId ?? "").trim().length > 0;
}

export function PreviousUpdaterForm({
  value,
  onChange,
  statuses,
}: {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  statuses: { id: string; name: string; category: string }[];
}) {
  const from = String(value.fromStatusId ?? "");
  const to = String(value.toStatusId ?? "");
  const set = (patch: Record<string, unknown>) => onChange({ ...value, ...patch });
  const statusOpts = statuses.map((s) => ({ value: s.id, label: s.name, pill: statusPill(s.category) }));
  // The "from" dropdown offers an "Any" option (grey pill) at the top.
  const fromOpts = [{ value: "any", label: "Any", pill: statusPill() }, ...statusOpts];

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">
          Restrict users who have changed the work item&apos;s status from this status
        </label>
        <PortalDropdown
          usePills
          placeholder="Select a status"
          options={fromOpts}
          selected={from ? [from] : []}
          onChange={(next) => set({ fromStatusId: next[0] ?? "" })}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">To this status</label>
        <PortalDropdown
          usePills
          placeholder="Select a status"
          options={statusOpts}
          selected={to ? [to] : []}
          onChange={(next) => set({ toStatusId: next[0] ?? "" })}
        />
      </div>
    </div>
  );
}

export function BeenThroughStatusForm({
  value,
  onChange,
  statuses,
}: {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  statuses: { id: string; name: string; category: string }[];
}) {
  const selected = Array.isArray(value.statusIds) ? (value.statusIds as string[]) : [];
  const mostRecentOnly = value.mostRecentOnly === true;
  const set = (patch: Record<string, unknown>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">
          Check that the work item has been through
        </label>
        <PortalDropdown
          multiple
          usePills
          placeholder="Select a status"
          options={statuses.map((s) => ({ value: s.id, label: s.name, pill: statusPill(s.category) }))}
          selected={selected}
          onChange={(next) => set({ statusIds: next })}
        />
      </div>

      <div className="space-y-3">
        <CheckboxRow
          checked={value.includeCurrent === true}
          onChange={(v) => set({ includeCurrent: v })}
          label="Include the current status of the work item"
        />
        <CheckboxRow
          checked={value.reverse === true}
          onChange={(v) => set({ reverse: v })}
          label="Reverse this rule"
          description="Only allow the transition if the work item hasn't been through the selected statuses."
        />
        <CheckboxRow
          checked={mostRecentOnly}
          onChange={(v) => set({ mostRecentOnly: v, ...(v ? {} : { ignoreLoops: false }) })}
          label="Only consider the most recent status of the work item"
          description="Only check the status set just prior to the current status of the work item."
        />
        {mostRecentOnly && (
          <CheckboxRow
            indent
            checked={value.ignoreLoops === true}
            onChange={(v) => set({ ignoreLoops: v })}
            label="Ignore status updates from looped transitions"
            description="Ignore transitions where the work item's most recent status exactly matches the current status."
          />
        )}
      </div>
    </div>
  );
}

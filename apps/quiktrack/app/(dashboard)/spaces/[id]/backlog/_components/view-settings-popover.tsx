"use client";

import { X } from "lucide-react";

/** Per-user, per-project backlog view preferences (persisted to localStorage). */
export interface BacklogViewSettings {
  /** Show the left-hand Epic panel. */
  epicPanel: boolean;
  /** Show sprints that have zero work items. */
  emptySprints: boolean;
  /** Show completed sprints in the backlog (hidden by default). */
  completedSprints: boolean;
  /** Row spacing. */
  density: "default" | "compact";
  /** Which columns render on each work-item row. */
  fields: {
    workType: boolean;
    key: boolean;
    epic: boolean;
    /** Story-point estimate badge (Jira-style). */
    estimate: boolean;
    status: boolean;
    assignee: boolean;
  };
}

export const DEFAULT_VIEW_SETTINGS: BacklogViewSettings = {
  epicPanel: false,
  emptySprints: true,
  completedSprints: false,
  density: "default",
  fields: { workType: true, key: true, epic: true, estimate: true, status: true, assignee: true },
};

const FIELD_LABELS: Array<{ key: keyof BacklogViewSettings["fields"]; label: string }> = [
  { key: "workType", label: "Work type" },
  { key: "key", label: "Work item key" },
  { key: "epic", label: "Epic" },
  { key: "estimate", label: "Story points" },
  { key: "status", label: "Status" },
  { key: "assignee", label: "Assignee" },
];

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-blue-600" : "bg-gray-300"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export function ViewSettingsPopover({
  settings,
  onChange,
  onClose,
}: {
  settings: BacklogViewSettings;
  onChange: (patch: Partial<BacklogViewSettings>) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute right-0 top-full z-40 mt-1 w-72 rounded-lg border border-gray-200 bg-white p-4 shadow-xl">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">View settings</h3>
        <button type="button" onClick={onClose} className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center justify-between py-1.5">
        <span className="text-sm text-gray-700">Epic panel</span>
        <Switch label="Epic panel" checked={settings.epicPanel} onChange={(v) => onChange({ epicPanel: v })} />
      </div>
      <div className="flex items-center justify-between py-1.5">
        <span className="text-sm text-gray-700">Empty sprints</span>
        <Switch label="Empty sprints" checked={settings.emptySprints} onChange={(v) => onChange({ emptySprints: v })} />
      </div>
      <div className="flex items-center justify-between py-1.5">
        <span className="text-sm text-gray-700">Completed sprints</span>
        <Switch label="Completed sprints" checked={settings.completedSprints} onChange={(v) => onChange({ completedSprints: v })} />
      </div>

      <div className="mt-3 border-t border-gray-100 pt-3">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">Density</p>
        <div className="space-y-1">
          {(["default", "compact"] as const).map((d) => (
            <label key={d} className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="backlog-density"
                checked={settings.density === d}
                onChange={() => onChange({ density: d })}
                className="h-3.5 w-3.5 text-blue-600 focus:ring-blue-400"
              />
              <span className="capitalize">{d}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="mt-3 border-t border-gray-100 pt-3">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">Fields</p>
        <div className="space-y-1">
          {FIELD_LABELS.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between py-0.5">
              <span className="text-sm text-gray-700">{label}</span>
              <Switch
                label={label}
                checked={settings.fields[key]}
                onChange={(v) => onChange({ fields: { ...settings.fields, [key]: v } })}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

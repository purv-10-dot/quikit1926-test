"use client";

import { useEffect, useRef } from "react";
import { Sliders } from "lucide-react";
import type { TimelineViewSettings } from "./timeline-view-settings";

/** "View settings" popover for the Timeline — toggles + bar-color choice. */
export function TimelineSettingsPopover({
  open,
  onOpenChange,
  settings,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: TimelineViewSettings;
  onChange: (patch: Partial<TimelineViewSettings>) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (open && ref.current && !ref.current.contains(e.target as Node)) onOpenChange(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open, onOpenChange]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-label="View settings"
        className={`p-1.5 rounded text-gray-600 ${open ? "bg-gray-100" : "hover:bg-gray-100"}`}
      >
        <Sliders className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-64 rounded-md border border-gray-200 bg-white p-3 shadow-lg">
          <p className="mb-2 text-xs font-semibold text-gray-900">View settings</p>

          <ToggleRow
            label="Hide done work items"
            checked={settings.hideDone}
            onChange={(v) => onChange({ hideDone: v })}
          />

          <p className="mt-3 mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">
            Show fields
          </p>
          <ToggleRow
            label="Status column"
            checked={settings.showStatus}
            onChange={(v) => onChange({ showStatus: v })}
          />
          <ToggleRow
            label="Assignee column"
            checked={settings.showAssignee}
            onChange={(v) => onChange({ showAssignee: v })}
          />
          <ToggleRow
            label="Start date column"
            checked={settings.showStart}
            onChange={(v) => onChange({ showStart: v })}
          />
          <ToggleRow
            label="Due date column"
            checked={settings.showEnd}
            onChange={(v) => onChange({ showEnd: v })}
          />
          <ToggleRow
            label="Warnings"
            checked={settings.showWarnings}
            onChange={(v) => onChange({ showWarnings: v })}
          />

          <p className="mt-3 mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">
            Timeline bar color
          </p>
          <RadioRow
            label="Match work item status"
            checked={settings.barColor === "status"}
            onSelect={() => onChange({ barColor: "status" })}
          />
          <div className="flex items-center justify-between py-1">
            <RadioRow
              label="Custom color"
              checked={settings.barColor === "custom"}
              onSelect={() => onChange({ barColor: "custom" })}
            />
            <input
              type="color"
              value={settings.customColor}
              onChange={(e) => onChange({ barColor: "custom", customColor: e.target.value })}
              className="h-6 w-7 cursor-pointer rounded border border-gray-200 bg-white p-0.5"
              aria-label="Custom bar color"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between py-1 text-xs text-gray-700">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative inline-block h-4 w-8 rounded-full transition-colors ${
          checked ? "bg-blue-600" : "bg-gray-300"
        }`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}

function RadioRow({
  label,
  checked,
  onSelect,
}: {
  label: string;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex items-center gap-2 py-1 text-xs text-gray-700"
    >
      <span
        className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border ${
          checked ? "border-blue-600" : "border-gray-300"
        }`}
      >
        {checked && <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />}
      </span>
      {label}
    </button>
  );
}

"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { PROJECT_TABS, enabledTabPaths } from "@/lib/projectTabs";
import { TAB_ICONS } from "./tab-icons";

/**
 * Space-Admin popover to choose which tabs appear in a project. Toggles persist
 * to QtProject.tabConfig (ordered list of enabled paths) via PATCH
 * /api/projects/[id]. Role permissions still gate each tab on top of this; at
 * least one tab must stay enabled.
 */
export function TabCustomizer({
  projectId,
  tabConfig,
  onSaved,
  onClose,
}: {
  projectId: string;
  tabConfig: string[] | null;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [enabled, setEnabled] = useState<Set<string>>(
    () => new Set(enabledTabPaths(tabConfig)),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const count = enabled.size;

  function toggle(path: string) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        if (next.size <= 1) return prev; // keep at least one tab
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    // Persist in canonical tab order, not click order.
    const ordered = PROJECT_TABS.filter((t) => enabled.has(t.path)).map((t) => t.path);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tabConfig: ordered }),
      }).then((r) => r.json());
      if (!res?.success) {
        setError(res?.error ?? "Failed to save tabs");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Failed to save tabs");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-gray-200 rounded-md shadow-xl z-40 p-2">
      <div className="px-2 py-1 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-900">Customize tabs</span>
        <button
          type="button"
          onClick={() => setEnabled(new Set(PROJECT_TABS.map((t) => t.path)))}
          className="text-[11px] text-blue-600 hover:underline"
        >
          Show all
        </button>
      </div>
      <p className="px-2 pb-1 text-[11px] text-gray-500">
        Choose which tabs appear in this project. Roles still control access.
      </p>
      <div className="max-h-72 overflow-y-auto py-1">
        {PROJECT_TABS.map((t) => {
          const Icon = TAB_ICONS[t.path];
          const on = enabled.has(t.path);
          const lockLast = on && count <= 1;
          return (
            <button
              key={t.path}
              type="button"
              onClick={() => toggle(t.path)}
              disabled={lockLast}
              title={lockLast ? "At least one tab must stay visible" : undefined}
              className={`w-full flex items-center gap-2 px-2 h-8 rounded text-sm text-left hover:bg-gray-100 disabled:cursor-not-allowed ${
                on ? "text-gray-900" : "text-gray-400"
              }`}
            >
              {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
              <span className="flex-1 truncate">{t.label}</span>
              <span
                className={`inline-flex h-4 w-4 items-center justify-center rounded border ${
                  on ? "bg-blue-600 border-blue-600 text-white" : "border-gray-300"
                }`}
              >
                {on && <Check className="h-3 w-3" />}
              </span>
            </button>
          );
        })}
      </div>
      {error && <div className="px-2 py-1 text-[11px] text-red-600">{error}</div>}
      <div className="flex items-center justify-end gap-2 px-2 pt-1.5 mt-1 border-t border-gray-100">
        <button
          type="button"
          onClick={onClose}
          className="h-7 px-2.5 text-xs text-gray-700 rounded hover:bg-gray-100"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="h-7 px-3 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";

const ACTIONS = ["view", "create", "edit", "delete", "export", "import", "markComplete"] as const;
type Action = (typeof ACTIONS)[number];

interface ModulePermRow {
  module: string;
  actions: Action[];
  hiddenFields: string[];
  restrictedFields: string[];
}

const STANDARD_MODULES = [
  "leads",
  "accounts",
  "contacts",
  "opportunities",
  "activities",
  "tasks",
  "notes",
  "campaigns",
  "automations",
  "imports",
  "reports",
  "settings",
  "telephony",
  "users",
  "icp",
];

interface Props {
  value: ModulePermRow[];
  onChange: (next: ModulePermRow[]) => void;
}

/**
 * Visual matrix editor: modules × actions checkboxes, plus comma-separated
 * hidden/restricted field inputs per row. Mirrors the legacy
 * AssignPermissionsPage layout but allows write.
 */
export function PermissionMatrixEditor({ value, onChange }: Props) {
  const [moduleToAdd, setModuleToAdd] = useState("");

  function ensureRow(module: string): number {
    const idx = value.findIndex((r) => r.module === module);
    if (idx >= 0) return idx;
    onChange([...value, { module, actions: [], hiddenFields: [], restrictedFields: [] }]);
    return value.length;
  }

  function toggleAction(module: string, action: Action) {
    const rows = [...value];
    const idx = rows.findIndex((r) => r.module === module);
    if (idx === -1) {
      rows.push({ module, actions: [action], hiddenFields: [], restrictedFields: [] });
    } else {
      const r = rows[idx]!;
      const has = r.actions.includes(action);
      rows[idx] = {
        ...r,
        actions: has ? r.actions.filter((a) => a !== action) : [...r.actions, action],
      };
    }
    onChange(rows);
  }

  function setFields(module: string, kind: "hiddenFields" | "restrictedFields", csv: string) {
    const list = csv.split(",").map((s) => s.trim()).filter(Boolean);
    const rows = [...value];
    const idx = rows.findIndex((r) => r.module === module);
    if (idx === -1) {
      rows.push({ module, actions: [], hiddenFields: kind === "hiddenFields" ? list : [], restrictedFields: kind === "restrictedFields" ? list : [] });
    } else {
      rows[idx] = { ...rows[idx]!, [kind]: list };
    }
    onChange(rows);
  }

  function removeRow(module: string) {
    onChange(value.filter((r) => r.module !== module));
  }

  const knownModules = new Set(value.map((r) => r.module));
  const availableToAdd = STANDARD_MODULES.filter((m) => !knownModules.has(m));

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-crm-border">
        <table className="w-full text-sm">
          <thead className="bg-crm-panel">
            <tr>
              <th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-crm-muted">Module</th>
              {ACTIONS.map((a) => (
                <th key={a} className="px-2 py-2 text-center text-xs font-medium text-crm-muted">
                  {a}
                </th>
              ))}
              <th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-crm-muted">Hidden fields</th>
              <th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-crm-muted">Restricted fields</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {value.length === 0 && (
              <tr>
                <td colSpan={ACTIONS.length + 4} className="px-3 py-6 text-center text-sm text-crm-muted">
                  No modules in this template yet. Add one below.
                </td>
              </tr>
            )}
            {value.map((row) => (
              <tr key={row.module} className="border-t border-crm-border">
                <td className="px-3 py-2 font-medium">{row.module}</td>
                {ACTIONS.map((a) => (
                  <td key={a} className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={row.actions.includes(a)}
                      onChange={() => toggleAction(row.module, a)}
                    />
                  </td>
                ))}
                <td className="px-3 py-2">
                  <input
                    className="crm-input min-w-[10rem]"
                    placeholder="email, phone"
                    defaultValue={row.hiddenFields.join(", ")}
                    onBlur={(e) => setFields(row.module, "hiddenFields", e.target.value)}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    className="crm-input min-w-[10rem]"
                    placeholder="status"
                    defaultValue={row.restrictedFields.join(", ")}
                    onBlur={(e) => setFields(row.module, "restrictedFields", e.target.value)}
                  />
                </td>
                <td className="px-2 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => removeRow(row.module)}
                    className="rounded p-1 text-red-600 hover:bg-red-50"
                    aria-label="Remove module"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {availableToAdd.length > 0 && (
        <div className="flex items-center gap-2 text-sm">
          <select
            value={moduleToAdd}
            onChange={(e) => setModuleToAdd(e.target.value)}
            className="crm-input max-w-xs"
          >
            <option value="">Add module…</option>
            {availableToAdd.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!moduleToAdd}
            onClick={() => {
              ensureRow(moduleToAdd);
              setModuleToAdd("");
            }}
            className="crm-btn-secondary"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}

export type { ModulePermRow };

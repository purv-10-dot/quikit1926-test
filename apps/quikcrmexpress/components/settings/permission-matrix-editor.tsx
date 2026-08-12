"use client";

import { useState } from "react";
import { CRM_MODULES } from "@/lib/api/permissions-registry";

const ACTIONS = ["view", "create", "edit", "delete", "export", "import", "markComplete"] as const;
type Action = (typeof ACTIONS)[number];

interface ModulePermRow {
  module: string;
  actions: Action[];
  hiddenFields: string[];
  restrictedFields: string[];
}

// Single source of truth — must match the backend gating registry so a
// configured row is never a silent no-op. (Was a hand-maintained list that
// drifted: it listed "users" but omitted dashboard/quotes/documents.)
const STANDARD_MODULES: string[] = [...CRM_MODULES];

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

  function currentActions(module: string): Action[] {
    return value.find((r) => r.module === module)?.actions ?? [];
  }

  function setRowActions(module: string, actions: Action[]) {
    const rows = [...value];
    const idx = rows.findIndex((r) => r.module === module);
    if (idx === -1) {
      rows.push({ module, actions, hiddenFields: [], restrictedFields: [] });
    } else {
      rows[idx] = { ...rows[idx]!, actions };
    }
    onChange(rows);
  }

  // Checkbox hierarchy:
  //  - any write/export/import/markComplete implies "view" (you can't act on
  //    what you can't see), so selecting one auto-selects "view";
  //  - clearing "view" clears the whole row (no read ⇒ no access).
  function toggleAction(module: string, action: Action) {
    const cur = currentActions(module);
    const has = cur.includes(action);
    let next: Action[];
    if (action === "view") {
      next = has ? [] : [...new Set<Action>([...cur, "view"])];
    } else if (has) {
      next = cur.filter((a) => a !== action);
    } else {
      next = [...new Set<Action>([...cur, action, "view"])];
    }
    setRowActions(module, next);
  }

  function toggleAllActions(module: string) {
    const allOn = ACTIONS.every((a) => currentActions(module).includes(a));
    setRowActions(module, allOn ? [] : [...ACTIONS]);
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
                <td className="px-3 py-2">
                  <label className="flex items-center gap-2 font-medium">
                    <input
                      type="checkbox"
                      aria-label={`Toggle all actions for ${row.module}`}
                      checked={ACTIONS.every((a) => row.actions.includes(a))}
                      ref={(el) => {
                        if (el)
                          el.indeterminate =
                            row.actions.length > 0 &&
                            !ACTIONS.every((a) => row.actions.includes(a));
                      }}
                      onChange={() => toggleAllActions(row.module)}
                    />
                    {row.module}
                  </label>
                </td>
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

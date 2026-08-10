"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { EditorRule, RuleKind } from "../editor-types";

/** Built-in rule types per kind + the config fields each needs (mirrors the engine registries). */
export const RULE_CATALOG: Record<RuleKind, { type: string; label: string; fields: string[] }[]> = {
  CONDITION: [
    { type: "is_assignee", label: "Only the assignee", fields: [] },
    { type: "in_project_role", label: "In project role", fields: ["roleName"] },
    { type: "has_permission", label: "Has permission", fields: ["resource", "action"] },
  ],
  VALIDATOR: [
    { type: "field_required", label: "Field required", fields: ["fieldId"] },
    { type: "permission_required", label: "Permission required", fields: ["resource", "action"] },
    { type: "field_regex", label: "Field matches pattern", fields: ["fieldId", "pattern"] },
  ],
  POSTFUNCTION: [
    { type: "set_resolution", label: "Set resolution", fields: ["resolutionId"] },
    { type: "clear_resolution", label: "Clear resolution (reopen)", fields: [] },
    { type: "assign", label: "Assign", fields: ["to"] },
    { type: "set_field", label: "Set field", fields: ["fieldId", "value"] },
    { type: "add_comment", label: "Add comment", fields: ["text"] },
  ],
};

/** Existing rules of one kind + a form to add another. */
export function RuleList({
  kind,
  rules,
  resolutions,
  onAdd,
  onRemove,
}: {
  kind: RuleKind;
  rules: { rule: EditorRule; index: number }[];
  resolutions: { id: string; name: string }[];
  onAdd: (rule: EditorRule) => void;
  onRemove: (index: number) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState(RULE_CATALOG[kind][0].type);
  const [config, setConfig] = useState<Record<string, string>>({});

  const entry = RULE_CATALOG[kind].find((r) => r.type === type) ?? RULE_CATALOG[kind][0];
  const labelFor = (t: string) => RULE_CATALOG[kind].find((r) => r.type === t)?.label ?? t;

  const add = () => {
    onAdd({ kind, type, config: { ...config } });
    setConfig({});
    setAdding(false);
  };

  return (
    <div className="space-y-2">
      {rules.length === 0 && !adding && (
        <p className="text-xs text-gray-400">None yet.</p>
      )}
      {rules.map(({ rule, index }) => (
        <div
          key={index}
          className="flex items-center gap-2 rounded border border-gray-200 px-2.5 py-1.5 text-sm"
        >
          <span className="truncate text-gray-800">{labelFor(rule.type)}</span>
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="ml-auto rounded p-0.5 text-gray-300 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {adding ? (
        <div className="rounded border border-gray-200 p-2.5">
          <label className="mb-1 block text-[11px] text-gray-500">Type</label>
          <select
            value={type}
            onChange={(e) => { setType(e.target.value); setConfig({}); }}
            className="mb-2 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          >
            {RULE_CATALOG[kind].map((r) => (
              <option key={r.type} value={r.type}>{r.label}</option>
            ))}
          </select>
          {entry.fields.map((f) => (
            <div key={f} className="mb-2">
              <label className="mb-1 block text-[11px] text-gray-500">{f}</label>
              {f === "resolutionId" ? (
                <select
                  value={config[f] ?? ""}
                  onChange={(e) => setConfig((c) => ({ ...c, [f]: e.target.value }))}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                >
                  <option value="">Select…</option>
                  {resolutions.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={config[f] ?? ""}
                  onChange={(e) => setConfig((c) => ({ ...c, [f]: e.target.value }))}
                  placeholder={f === "to" ? 'userId or "actor"' : f}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              )}
            </div>
          ))}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={add}
              className="inline-flex items-center gap-1 rounded bg-accent-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-700"
            >
              <Plus className="h-3 w-3" /> Add
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); setConfig({}); }}
              className="rounded border border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-xs font-medium text-accent-700 hover:underline"
        >
          + Add {kind === "CONDITION" ? "restriction" : kind === "VALIDATOR" ? "validator" : "action"}
        </button>
      )}
    </div>
  );
}

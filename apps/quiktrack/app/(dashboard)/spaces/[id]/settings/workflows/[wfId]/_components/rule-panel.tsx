"use client";

import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type { EditorRule, EditorTransition, RuleKind } from "./editor-types";

/** The built-in rule types per kind + the config fields each one needs. */
const RULE_CATALOG: Record<RuleKind, { type: string; label: string; fields: string[] }[]> = {
  CONDITION: [
    { type: "is_assignee", label: "Only the assignee", fields: [] },
    { type: "in_project_role", label: "In project role", fields: ["roleName"] },
    { type: "has_permission", label: "Has permission", fields: ["resource", "action"] },
  ],
  VALIDATOR: [
    { type: "field_required", label: "Field required", fields: ["fieldId"] },
    { type: "permission_required", label: "Permission required", fields: ["resource", "action"] },
  ],
  POSTFUNCTION: [
    { type: "set_resolution", label: "Set resolution", fields: ["resolutionId"] },
    { type: "clear_resolution", label: "Clear resolution (reopen)", fields: [] },
    { type: "assign", label: "Assign", fields: ["to"] },
    { type: "set_field", label: "Set field", fields: ["fieldId", "value"] },
  ],
};

const KIND_LABEL: Record<RuleKind, string> = {
  CONDITION: "Restrict (condition)",
  VALIDATOR: "Validate",
  POSTFUNCTION: "Perform action",
};

/**
 * Rules editor for one selected transition — the "Add Rule" surface. Lists the
 * transition's conditions / validators / post-functions and adds new ones with
 * a per-type config form. Config validation runs server-side on publish.
 */
export function RulePanel({
  transition,
  resolutions,
  onAddRule,
  onRemoveRule,
  onClose,
}: {
  transition: EditorTransition;
  resolutions: { id: string; name: string }[];
  onAddRule: (rule: EditorRule) => void;
  onRemoveRule: (index: number) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<RuleKind>("CONDITION");
  const [type, setType] = useState(RULE_CATALOG.CONDITION[0].type);
  const [config, setConfig] = useState<Record<string, string>>({});

  const catalogEntry = RULE_CATALOG[kind].find((r) => r.type === type) ?? RULE_CATALOG[kind][0];

  const resetFor = (k: RuleKind) => {
    setKind(k);
    setType(RULE_CATALOG[k][0].type);
    setConfig({});
  };

  const add = () => {
    onAddRule({ kind, type, config: { ...config } });
    setConfig({});
  };

  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col border-l border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-400">Transition</div>
          <div className="text-sm font-semibold text-gray-900">{transition.name}</div>
        </div>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="mb-3 text-xs font-medium text-gray-500">Rules on this transition</div>
        {transition.rules.length === 0 ? (
          <p className="mb-4 text-sm text-gray-400">No rules yet.</p>
        ) : (
          <ul className="mb-4 space-y-1.5">
            {transition.rules.map((r, i) => (
              <li key={i} className="flex items-center gap-2 rounded border border-gray-200 px-2.5 py-1.5 text-sm">
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">
                  {r.kind === "CONDITION" ? "IF" : r.kind === "VALIDATOR" ? "CHECK" : "THEN"}
                </span>
                <span className="truncate text-gray-800">{r.type}</span>
                <button
                  type="button"
                  onClick={() => onRemoveRule(i)}
                  className="ml-auto rounded p-0.5 text-gray-300 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="rounded-md border border-gray-200 p-3">
          <div className="mb-2 text-xs font-medium text-gray-500">Add a rule</div>
          <div className="mb-2 flex rounded border border-gray-300 text-xs">
            {(Object.keys(RULE_CATALOG) as RuleKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => resetFor(k)}
                className={`flex-1 px-2 py-1 ${kind === k ? "bg-accent-50 text-accent-700" : "text-gray-600"}`}
              >
                {KIND_LABEL[k].split(" ")[0]}
              </button>
            ))}
          </div>

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

          {catalogEntry.fields.map((f) => (
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

          <button
            type="button"
            onClick={add}
            className="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700"
          >
            <Plus className="h-3.5 w-3.5" /> Add rule
          </button>
        </div>
      </div>
    </aside>
  );
}

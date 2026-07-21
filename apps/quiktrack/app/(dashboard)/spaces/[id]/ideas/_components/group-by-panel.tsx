"use client";

import { useState } from "react";
import { X, ChevronDown, Search } from "lucide-react";
import { iconForColumn, isFormulaColumn } from "./field-icons";
import type { FieldEntry } from "./fields-panel";

export interface GroupByConfig {
  key: string;
  hideEmpty?: boolean;
}

/** Fields that don't make sense to group by (free text / computed / display). */
const UNGROUPABLE = new Set(["summary", "insights", "comments", "delivery", "key", "created", "updated"]);

/**
 * JPD "Group by" side panel. Pick a field → the grid renders one swimlane per
 * distinct value of that field. "Hide empty groups" toggle + "Edit field".
 */
export function GroupByPanel({
  value,
  fields,
  canEdit,
  onChange,
  onEditField,
  onClose,
}: {
  value: GroupByConfig | null;
  fields: FieldEntry[];
  canEdit: boolean;
  onChange: (next: GroupByConfig | null) => void;
  onEditField: (key: string) => void;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const groupable = fields.filter((f) => !UNGROUPABLE.has(f.key));
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const sel = value ? byKey.get(value.key) : undefined;
  const pickable = q ? groupable.filter((f) => f.label.toLowerCase().includes(q.toLowerCase())) : groupable;

  return (
    <aside className="fixed inset-y-0 right-0 z-[55] flex w-[440px] max-w-[92vw] flex-col border-l border-gray-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h3 className="text-lg font-semibold text-gray-900">Group by</h3>
        <button type="button" aria-label="Close" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <p className="mb-4 text-sm text-gray-600">
          Select a field. The different values of that field will be swimlanes in your list.
        </p>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => { setOpen((o) => !o); setQ(""); }}
              className="flex w-full items-center justify-between gap-1 rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-50"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                {sel && (isFormulaColumn(sel.field) ? <span className="w-4 text-center font-serif text-[13px] italic text-gray-500">fx</span> : (() => { const I = iconForColumn(sel.key, sel.field); return <I className="h-3.5 w-3.5 text-gray-500" />; })())}
                <span className="truncate">{sel ? sel.label : "Select a field"}</span>
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            </button>
            {open && (
              <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-xl">
                <div className="border-b border-gray-100 p-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2 top-1.5 h-3.5 w-3.5 text-gray-400" />
                    <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search fields" className="w-full rounded border border-gray-200 py-1 pl-7 pr-2 text-sm outline-none focus:border-blue-400" />
                  </div>
                </div>
                <div className="max-h-56 overflow-y-auto py-1">
                  {pickable.map((f) => {
                    const I = iconForColumn(f.key, f.field);
                    const active = f.key === value?.key;
                    return (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => { onChange({ key: f.key, hideEmpty: value?.hideEmpty }); setOpen(false); }}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50 ${active ? "bg-blue-50 font-medium text-blue-700" : "text-gray-700"}`}
                      >
                        {isFormulaColumn(f.field) ? <span className="w-4 text-center font-serif text-[13px] italic text-gray-500">fx</span> : <I className="h-4 w-4 shrink-0 text-gray-500" />}
                        {f.label}
                      </button>
                    );
                  })}
                  {pickable.length === 0 && <p className="px-3 py-2 text-sm text-gray-400">No fields</p>}
                </div>
              </div>
            )}
          </div>
          {value && (
            <button type="button" disabled={!canEdit} onClick={() => onChange(null)} aria-label="Clear grouping" className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {value && (
          <>
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => onChange({ ...value, hideEmpty: !value.hideEmpty })}
                aria-label="Hide empty groups"
                className={`relative h-4 w-7 rounded-full transition-colors ${value.hideEmpty ? "bg-green-500" : "bg-gray-300"} ${!canEdit ? "opacity-50" : ""}`}
              >
                <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${value.hideEmpty ? "left-3.5" : "left-0.5"}`} />
              </button>
              <span className="text-sm text-gray-700">Hide empty groups</span>
            </div>

            {sel && (
              <button
                type="button"
                onClick={() => onEditField(value.key)}
                className="mt-6 rounded border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Edit field
              </button>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

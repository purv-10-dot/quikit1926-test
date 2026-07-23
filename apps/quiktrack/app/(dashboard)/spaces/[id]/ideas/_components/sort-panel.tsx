"use client";

import { useState } from "react";
import { X, ChevronDown, ArrowUp, ArrowDown, Trash2, Search } from "lucide-react";
import { iconForColumn, isFormulaColumn } from "./field-icons";
import type { FieldEntry } from "./fields-panel";

export interface SortRule {
  key: string;
  dir: "asc" | "desc";
}

/**
 * JPD "Sort" side panel. Multi-level sort — each rule is a field + direction.
 * "Sort by" / "then by" rows, an inline field picker, asc/desc toggle, remove,
 * and Clear sort. onChange fires with the full rule list; the parent applies it
 * to the grid and persists (admin-gated).
 */
export function SortPanel({
  rules,
  fields,
  canEdit,
  onChange,
  onClose,
}: {
  rules: SortRule[];
  fields: FieldEntry[];
  canEdit: boolean;
  onChange: (rules: SortRule[]) => void;
  onClose: () => void;
}) {
  const [pickerFor, setPickerFor] = useState<number | null>(null); // row index whose picker is open (-1 = the "add" row)
  const [q, setQ] = useState("");

  const byKey = new Map(fields.map((f) => [f.key, f]));
  const usedKeys = new Set(rules.map((r) => r.key));
  const pickable = fields.filter((f) => (q ? f.label.toLowerCase().includes(q.toLowerCase()) : true));

  function setField(index: number, key: string) {
    const next = index >= rules.length
      ? [...rules, { key, dir: "asc" as const }]
      : rules.map((r, i) => (i === index ? { ...r, key } : r));
    onChange(next);
    setPickerFor(null); setQ("");
  }
  function toggleDir(index: number) {
    onChange(rules.map((r, i) => (i === index ? { ...r, dir: r.dir === "asc" ? "desc" : "asc" } : r)));
  }
  function removeRule(index: number) { onChange(rules.filter((_, i) => i !== index)); }
  function clearAll() { onChange([]); }

  function Picker({ index, selectedKey }: { index: number; selectedKey?: string }) {
    const sel = selectedKey ? byKey.get(selectedKey) : undefined;
    const open = pickerFor === index;
    return (
      <div className="relative flex-1">
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => { setPickerFor(open ? null : index); setQ(""); }}
          className="flex w-full items-center justify-between gap-1 rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-50"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {sel && (isFormulaColumn(sel.field)
              ? <span className="w-4 text-center font-serif text-[13px] italic text-gray-500">fx</span>
              : (() => { const I = iconForColumn(sel.key, sel.field); return <I className="h-3.5 w-3.5 text-gray-500" />; })())}
            <span className="truncate">{sel ? sel.label : "Select field"}</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        </button>
        {open && (
          <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-gray-200 bg-white shadow-xl">
            <div className="border-b border-gray-100 p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1.5 h-3.5 w-3.5 text-gray-400" />
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="w-full rounded border border-gray-200 py-1 pl-7 pr-2 text-sm outline-none focus:border-blue-400" />
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto py-1">
              {pickable.map((f) => {
                const disabled = usedKeys.has(f.key) && f.key !== selectedKey;
                const I = iconForColumn(f.key, f.field);
                const selected = f.key === selectedKey;
                return (
                  <button
                    key={f.key}
                    type="button"
                    disabled={disabled}
                    onClick={() => setField(index, f.key)}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50 disabled:cursor-default disabled:text-gray-300 ${
                      selected ? "bg-blue-50 font-medium text-blue-700" : "text-gray-700"
                    }`}
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
    );
  }

  return (
    <aside className="fixed inset-y-0 right-0 z-[55] flex w-[440px] max-w-[92vw] flex-col border-l border-gray-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h3 className="text-lg font-semibold text-gray-900">Sort</h3>
        <button type="button" aria-label="Close" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <p className="mb-4 text-sm text-gray-600">Select the fields you want to use to sort ideas in this view</p>

        <div className="space-y-2">
          {rules.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-sm text-gray-500">{i === 0 ? "Sort by" : "then by"}</span>
              <Picker index={i} selectedKey={r.key} />
              <button type="button" disabled={!canEdit} onClick={() => toggleDir(i)} aria-label="Toggle direction" className="rounded border border-gray-300 p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-50">
                {r.dir === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
              </button>
              <button type="button" disabled={!canEdit} onClick={() => removeRule(i)} aria-label="Remove" className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600 disabled:opacity-50">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}

          {/* "then by" add-row (only if fields remain and admin). */}
          {canEdit && rules.length < fields.length && (
            <div className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-sm text-gray-500">{rules.length === 0 ? "Sort by" : "then by"}</span>
              <Picker index={rules.length} />
              <span className="w-[68px] shrink-0" />
            </div>
          )}
        </div>

        {rules.length > 0 && (
          <button type="button" disabled={!canEdit} onClick={clearAll} className="mt-4 text-sm text-blue-600 hover:underline disabled:opacity-50">
            Clear sort
          </button>
        )}
      </div>
    </aside>
  );
}

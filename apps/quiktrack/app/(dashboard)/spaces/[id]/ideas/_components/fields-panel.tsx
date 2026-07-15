"use client";

import { useState } from "react";
import { X, Search, GripVertical, Settings2 } from "lucide-react";
import { iconForColumn, isFormulaColumn } from "./field-icons";
import type { Column } from "./ideas-table";

export interface FieldEntry {
  key: string;
  label: string;
  field?: Column["field"];
}

/**
 * JPD "Fields" side panel. Lists the fields IN this view (toggle off to hide,
 * drag to reorder) and the AVAILABLE fields (toggle on to add), each with its
 * type icon. Summary is locked on. Toggling persists via onToggle; admins can
 * reorder. Non-admins get read-only toggles (onToggle no-ops upstream).
 */
export function FieldsPanel({
  inView,
  available,
  canEdit,
  onToggle,
  onReorder,
  onClose,
}: {
  inView: FieldEntry[];
  available: FieldEntry[];
  canEdit: boolean;
  onToggle: (key: string, show: boolean) => void;
  onReorder: (fromKey: string, toKey: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  const match = (e: FieldEntry) => !q || e.label.toLowerCase().includes(q.toLowerCase());
  const shown = inView.filter(match);
  const avail = available.filter(match);

  function FieldRow({ e, on, draggable }: { e: FieldEntry; on: boolean; draggable: boolean }) {
    const Icon = iconForColumn(e.key, e.field);
    const locked = e.key === "summary";
    return (
      <div
        draggable={draggable && canEdit}
        onDragStart={(ev) => { setDragKey(e.key); ev.dataTransfer.effectAllowed = "move"; }}
        onDragEnd={() => { setDragKey(null); setOverKey(null); }}
        onDragOver={(ev) => { if (dragKey && draggable && dragKey !== e.key) { ev.preventDefault(); ev.dataTransfer.dropEffect = "move"; setOverKey(e.key); } }}
        onDragLeave={() => { if (overKey === e.key) setOverKey(null); }}
        onDrop={(ev) => { ev.preventDefault(); if (dragKey && dragKey !== e.key && draggable) onReorder(dragKey, e.key); setDragKey(null); setOverKey(null); }}
        className={`group flex items-center gap-2 rounded px-1.5 py-1.5 hover:bg-gray-50 ${
          dragKey === e.key ? "opacity-40" : ""
        } ${overKey === e.key ? "border-t-2 border-blue-500" : "border-t-2 border-transparent"}`}
      >
        {draggable && canEdit ? (
          <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-gray-300 group-hover:text-gray-400 active:cursor-grabbing" />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        {isFormulaColumn(e.field) ? (
          <span className="w-4 shrink-0 text-center font-serif text-[13px] italic text-gray-500">fx</span>
        ) : (
          <Icon className="h-4 w-4 shrink-0 text-gray-500" />
        )}
        <span className="flex-1 truncate text-sm text-gray-800">{e.label}</span>
        {/* Toggle switch. Summary is locked on — hovering shows a can't-remove tip. */}
        <span className="group/tog relative shrink-0">
          <button
            type="button"
            disabled={locked || !canEdit}
            onClick={() => onToggle(e.key, !on)}
            aria-label={on ? `Hide ${e.label}` : `Show ${e.label}`}
            className={`relative block h-4 w-7 rounded-full transition-colors ${on ? "bg-green-500" : "bg-gray-300"} ${locked || !canEdit ? "cursor-default opacity-50" : ""}`}
          >
            <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${on ? "left-3.5" : "left-0.5"}`} />
          </button>
          {locked && (
            <span className="pointer-events-none absolute right-0 top-full z-50 mt-1 hidden whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs font-medium text-white shadow group-hover/tog:block">
              This field cannot be removed
            </span>
          )}
        </span>
      </div>
    );
  }

  return (
    <aside className="fixed inset-y-0 right-0 z-[55] flex w-[440px] max-w-[92vw] flex-col border-l border-gray-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h3 className="text-lg font-semibold text-gray-900">Fields</h3>
        <div className="flex items-center gap-1 text-gray-400">
          <Settings2 className="h-4 w-4" />
          <button type="button" aria-label="Close" onClick={onClose} className="rounded p-1 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="border-b border-gray-100 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search all space fields"
            className="w-full rounded border border-gray-300 py-1.5 pl-8 pr-2 text-sm outline-none focus:border-blue-400"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <p className="px-1 py-1 text-xs font-semibold text-gray-500">Fields in this view ({inView.length})</p>
        {shown.map((e) => <FieldRow key={e.key} e={e} on draggable />)}

        <p className="mt-3 px-1 py-1 text-xs font-semibold text-gray-500">Available fields ({available.length})</p>
        <p className="px-1 pb-1 text-xs text-gray-400">Toggle a field to add it to this view.</p>
        {avail.map((e) => <FieldRow key={e.key} e={e} on={false} draggable={false} />)}
        {shown.length === 0 && avail.length === 0 && (
          <p className="px-1 py-3 text-sm text-gray-400">No matching fields.</p>
        )}
      </div>
    </aside>
  );
}

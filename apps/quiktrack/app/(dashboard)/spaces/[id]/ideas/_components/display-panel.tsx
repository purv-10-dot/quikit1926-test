"use client";

import { useState } from "react";
import { X, ChevronDown, Search } from "lucide-react";
import { iconForColumn } from "./field-icons";
import type { FieldEntry } from "./fields-panel";

export interface DisplaySettings {
  rowNumbers?: boolean;
  rowColor?: { key: string; style: "background" | "highlight" } | null;
}

/** Fields you can color rows by (JPD): everything except free-text and
 *  display-only/system columns. */
const NON_COLORABLE = new Set([
  "summary", "insights", "comments", "delivery", "key", "created", "updated",
  "assignee", "creator", "documents", "idea_short_description", "custom_name",
]);
function colorable(e: FieldEntry): boolean {
  if (NON_COLORABLE.has(e.key)) return false;
  const t = e.field?.type;
  // Exclude free-text field types.
  if (t === "SHORT_TEXT" || t === "LONG_TEXT" || t === "URL") return false;
  return true;
}

/**
 * JPD "Display settings" side panel: toggle a row-number column, and color ideas
 * by a field's values (Background or Highlight). Colors are derived per value.
 */
export function DisplayPanel({
  settings,
  fields,
  canEdit,
  onChange,
  onEditField,
  onClose,
}: {
  settings: DisplaySettings;
  fields: FieldEntry[];
  canEdit: boolean;
  onChange: (next: DisplaySettings) => void;
  onEditField: (key: string) => void;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const options = fields.filter(colorable);
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const sel = settings.rowColor ? byKey.get(settings.rowColor.key) : undefined;
  const pickable = q ? options.filter((f) => f.label.toLowerCase().includes(q.toLowerCase())) : options;

  return (
    <aside className="fixed inset-y-0 right-0 z-[55] flex w-[440px] max-w-[92vw] flex-col border-l border-gray-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h3 className="text-lg font-semibold text-gray-900">Display settings</h3>
        <button type="button" aria-label="Close" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {/* Row numbers */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-gray-900">Row numbers</p>
            <p className="mt-0.5 text-xs text-gray-500">Show a row number column in the list view.</p>
          </div>
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => onChange({ ...settings, rowNumbers: !settings.rowNumbers })}
            aria-label="Toggle row numbers"
            className={`relative mt-0.5 h-4 w-7 shrink-0 rounded-full transition-colors ${settings.rowNumbers ? "bg-green-500" : "bg-gray-300"} ${!canEdit ? "opacity-50" : ""}`}
          >
            <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${settings.rowNumbers ? "left-3.5" : "left-0.5"}`} />
          </button>
        </div>

        <hr className="my-4 border-gray-100" />

        {/* Row colors */}
        <p className="text-sm font-semibold text-gray-900">Row colors</p>
        <p className="mt-0.5 text-xs text-gray-500">Select a field and we’ll color ideas based on its values.</p>

        <div className="mt-3 flex items-center gap-2">
          <div className="relative flex-1">
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => { setOpen((o) => !o); setQ(""); }}
              className="flex w-full items-center justify-between gap-1 rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-50"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                {sel && (() => { const I = iconForColumn(sel.key, sel.field); return <I className="h-3.5 w-3.5 text-gray-500" />; })()}
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
                    const active = f.key === settings.rowColor?.key;
                    return (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => { onChange({ ...settings, rowColor: { key: f.key, style: settings.rowColor?.style ?? "background" } }); setOpen(false); }}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50 ${active ? "bg-blue-50 font-medium text-blue-700" : "text-gray-700"}`}
                      >
                        <I className="h-4 w-4 shrink-0 text-gray-500" /> {f.label}
                      </button>
                    );
                  })}
                  {pickable.length === 0 && <p className="px-3 py-2 text-sm text-gray-400">No colorable fields</p>}
                </div>
              </div>
            )}
          </div>
          {settings.rowColor && (
            <button type="button" disabled={!canEdit} onClick={() => onChange({ ...settings, rowColor: null })} aria-label="Clear row color" className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {settings.rowColor && (
          <>
            {sel && (
              <button type="button" onClick={() => onEditField(settings.rowColor!.key)} className="mt-3 rounded border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                Edit field
              </button>
            )}
            <p className="mt-4 text-sm font-medium text-gray-700">Style</p>
            <div className="mt-2 space-y-2">
              {(["background", "highlight"] as const).map((style) => (
                <label key={style} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    checked={settings.rowColor!.style === style}
                    onChange={() => onChange({ ...settings, rowColor: { key: settings.rowColor!.key, style } })}
                    disabled={!canEdit}
                  />
                  <span className="text-sm capitalize text-gray-700">{style}</span>
                </label>
              ))}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

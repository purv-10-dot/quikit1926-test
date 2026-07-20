"use client";

import { useState } from "react";
import { Plus, Search, Loader2 } from "lucide-react";
import { iconForColumn, isFormulaColumn } from "./field-icons";
import type { FieldDef } from "./ideas-types";

/** Field types offered when creating a field inline (JPD's common set). */
const CREATE_TYPES: { type: string; label: string }[] = [
  { type: "SHORT_TEXT", label: "Text" },
  { type: "LONG_TEXT", label: "Paragraph" },
  { type: "NUMBER", label: "Number" },
  { type: "URL", label: "Link (URL)" },
  { type: "CHECKBOX", label: "Checkbox" },
  { type: "DATE", label: "Date" },
  { type: "DROPDOWN_SINGLE", label: "Dropdown (single)" },
  { type: "DROPDOWN_MULTI", label: "Dropdown (multi)" },
];

/**
 * The "+ add column" picker at the end of the ideas table header (JPD). Lists
 * fields/columns not currently shown; selecting one adds it to the view. If the
 * typed name matches nothing, offers "Create field" → pick a type → creates a
 * real space custom field, then adds it as a column. Fixed-positioned so the
 * table's horizontal scroll can't clip it.
 */
export function AddColumnMenu({
  projectId,
  options,
  onAdd,
  onCreated,
}: {
  projectId: string;
  options: { key: string; label: string; field?: FieldDef }[];
  onAdd: (key: string) => void;
  /** Called with the new field's key after it's created + the bundle refetched. */
  onCreated: (key: string) => void;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [q, setQ] = useState("");
  const [picking, setPicking] = useState(false); // show the type picker
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = q.trim();
  const filtered = name ? options.filter((o) => o.label.toLowerCase().includes(name.toLowerCase())) : options;
  const exactMatch = options.some((o) => o.label.toLowerCase() === name.toLowerCase());
  const canCreate = name.length > 0 && !exactMatch;

  function close() { setPos(null); setPicking(false); setError(null); }

  async function createField(type: string) {
    if (!name || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/custom-fields`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Dropdowns need at least one option; seed a placeholder the user can rename.
        body: JSON.stringify({
          name,
          type,
          ...(type.startsWith("DROPDOWN") ? { options: [{ label: "Option 1" }] } : {}),
        }),
      });
      const j = (await res.json()) as { success: boolean; data?: { key: string }; error?: string };
      if (!res.ok || !j.success || !j.data) { setError(j.error ?? "Couldn’t create field"); return; }
      onCreated(j.data.key);
      close();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="Add column"
        onClick={(e) => {
          if (pos) { close(); return; }
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setPos({ x: r.left, y: r.bottom + 4 });
          setQ(""); setPicking(false); setError(null);
        }}
        className={`rounded p-0.5 ${pos ? "text-blue-600" : "text-gray-400 hover:text-gray-600"}`}
      >
        <Plus className="h-4 w-4" />
      </button>
      {pos && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div
            style={{ position: "fixed", left: Math.max(8, pos.x - 200), top: pos.y }}
            className="z-50 w-64 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl"
          >
            <div className="border-b border-gray-100 p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1.5 h-3.5 w-3.5 text-gray-400" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => { setQ(e.target.value); setPicking(false); setError(null); }}
                  placeholder="Search"
                  className="w-full rounded border border-gray-200 py-1 pl-7 pr-2 text-sm outline-none focus:border-blue-400"
                />
              </div>
              <p className="mt-1.5 px-1 text-xs text-gray-400">Select a field or create one</p>
            </div>

            {picking ? (
              // Choose a type for the new field.
              <div className="max-h-72 overflow-y-auto py-1">
                <p className="px-3 py-1 text-xs font-medium text-gray-500">Field type for “{name}”</p>
                {CREATE_TYPES.map((t) => (
                  <button
                    key={t.type}
                    type="button"
                    disabled={busy}
                    onClick={() => void createField(t.type)}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {t.label}
                    {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
                  </button>
                ))}
                {error && <p className="px-3 py-1.5 text-xs text-red-600">{error}</p>}
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto py-1">
                {filtered.map((o) => {
                  const Icon = iconForColumn(o.key, o.field);
                  return (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => { onAdd(o.key); close(); }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                    >
                      {isFormulaColumn(o.field) ? (
                        <span className="w-4 shrink-0 text-center font-serif text-[13px] italic text-gray-500">fx</span>
                      ) : (
                        <Icon className="h-4 w-4 shrink-0 text-gray-500" />
                      )}
                      {o.label}
                    </button>
                  );
                })}
                {filtered.length === 0 && !canCreate && (
                  <p className="px-3 py-2 text-sm text-gray-400">No fields</p>
                )}
                {canCreate && (
                  <button
                    type="button"
                    onClick={() => setPicking(true)}
                    className="flex w-full items-center gap-2 border-t border-gray-100 px-3 py-2 text-left text-sm font-medium text-blue-600 hover:bg-gray-50"
                  >
                    <Plus className="h-3.5 w-3.5" /> Create “{name}”
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

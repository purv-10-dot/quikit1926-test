"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, GripVertical, Plus, X, Trash2, Tag } from "lucide-react";
import { RichTextEditor } from "@/components/rich-text-editor-lazy";
import { uploadProjectImage } from "@/lib/upload-image";
import { THEME_META } from "./ideas-types";

/** Strip HTML to test if a rich-text value is really empty. */
function plainText(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

/**
 * "Edit field" panel for a discovery custom field (JPD's field editor). Reuses
 * the existing space custom-field APIs:
 *   PATCH  /api/projects/[id]/custom-fields/[fieldId]  { name, description, options[] }
 *   DELETE /api/projects/[id]/custom-fields/[fieldId]
 * Options array order = new positions; existing options carry `id` (rename via
 * label), new ones omit it, omitted ones are removed. Rendered as a full-panel
 * overlay opened from the option menu's "Edit field".
 */

interface Opt { id?: string; label: string; value?: string; isActive?: boolean }
interface FieldData {
  id: string; key: string; name: string; type: string; description: string | null; icon: string | null;
  options: { id: string; label: string; value: string; isActive: boolean; position: number }[];
}

const TYPE_LABEL: Record<string, string> = {
  DROPDOWN_SINGLE: "Single-select field",
  DROPDOWN_MULTI: "Multi-select field",
  SHORT_TEXT: "Text field",
  LONG_TEXT: "Long text field",
  NUMBER: "Number field",
  DATE: "Date field",
  CHECKBOX: "Checkbox field",
};

export function FieldEditorPanel({
  projectId,
  fieldId,
  onClose,
  onSaved,
}: {
  projectId: string;
  fieldId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const base = `/api/projects/${projectId}/custom-fields/${fieldId}`;
  const [field, setField] = useState<FieldData | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [options, setOptions] = useState<Opt[]>([]);
  const [newOpt, setNewOpt] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descSnapshot, setDescSnapshot] = useState(""); // for Cancel revert

  /** Load the field into local state (also used to refresh after a save so new
   *  options gain their real ids and stale/duplicate rows don't accumulate). */
  function applyField(d: FieldData) {
    setField(d);
    setName(d.name);
    setDescription(d.description ?? "");
    setOptions(d.options.filter((o) => o.isActive).sort((a, b) => a.position - b.position).map((o) => ({ id: o.id, label: o.label, value: o.value })));
  }

  useEffect(() => {
    let alive = true;
    fetch(base).then((r) => r.json()).then((j: { success: boolean; data?: FieldData }) => {
      if (alive && j.success && j.data) applyField(j.data);
    }).catch(() => undefined);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  const hasOptions = field ? field.type.startsWith("DROPDOWN") : false;

  /** Persist name/description/options. `close` true closes the whole panel
   *  (bottom Save); false keeps it open (inline description Save). */
  async function save(close: boolean) {
    setBusy(true);
    try {
      const res = await fetch(base, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          // Field-definition description is capped at 300 chars (schema metadata),
          // so store the plain text of whatever was typed in the editor.
          description: plainText(description).slice(0, 300) || null,
          ...(hasOptions ? { options: options.filter((o) => o.label.trim()).map((o) => ({ ...(o.id ? { id: o.id } : {}), label: o.label.trim() })) } : {}),
        }),
      });
      if (res.ok) {
        onSaved();
        if (close) { onClose(); }
        else {
          // Refresh local state from the server so newly-created options get
          // their ids (prevents them re-creating/vanishing on the next save).
          const j = (await res.json()) as { success: boolean; data?: FieldData };
          if (j.success && j.data) applyField(j.data);
        }
      }
    } finally { setBusy(false); }
  }

  async function del() {
    setBusy(true);
    try {
      const res = await fetch(base, { method: "DELETE" });
      // A field with stored values returns 409 → archive instead.
      if (res.status === 409) {
        const res2 = await fetch(`${base}?confirmArchive=true`, { method: "DELETE" });
        if (res2.ok) { onSaved(); onClose(); }
      } else if (res.ok) { onSaved(); onClose(); }
    } finally { setBusy(false); }
  }

  function addOption() {
    const l = newOpt.trim();
    if (!l) return;
    setOptions((o) => [...o, { label: l }]);
    setNewOpt("");
  }
  function reorder(from: number, to: number) {
    setOptions((o) => { const n = [...o]; const [m] = n.splice(from, 1); n.splice(to, 0, m); return n; });
  }

  return (
    <aside className="fixed inset-y-0 right-0 z-[60] flex w-[520px] flex-col border-l border-gray-200 bg-white shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4">
        <button type="button" onClick={onClose} className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" /> Back to idea details
        </button>
      </div>
      <div className="flex items-center gap-1.5 px-4 pt-3 text-sm text-gray-500">
        <Tag className="h-4 w-4" /> {field ? (TYPE_LABEL[field.type] ?? "Field") : "Field"}
      </div>

      {/* Body */}
      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {/* Field name */}
        <div className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 focus-within:border-blue-400">
          <Tag className="h-4 w-4 shrink-0 text-gray-400" />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Field name"
            className="flex-1 bg-transparent text-sm font-medium outline-none"
          />
        </div>

        {/* Description — read-only by default; click to open the rich-text
            editor (JPD). Field-definition descriptions are capped at 300 chars
            server-side, so we save the plain text. */}
        {editingDesc ? (
          <div>
            <RichTextEditor
              value={description}
              onChange={setDescription}
              placeholder="Add a description…"
              uploadImage={(file) => uploadProjectImage(projectId, file)}
            />
            <div className="mt-2 flex items-center gap-2">
              <button type="button" disabled={busy} onClick={() => { void save(false); setEditingDesc(false); }} className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                Save
              </button>
              <button type="button" onClick={() => { setDescription(descSnapshot); setEditingDesc(false); }} className="text-sm text-gray-500 hover:text-gray-700">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div
            onClick={() => { setDescSnapshot(description); setEditingDesc(true); }}
            className="cursor-text rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-700 hover:bg-gray-100"
          >
            {plainText(description) ? (
              <span dangerouslySetInnerHTML={{ __html: description }} />
            ) : (
              <span className="text-gray-400">Add a description…</span>
            )}
          </div>
        )}

        {/* Options (dropdown fields only) */}
        {hasOptions && (
          <div>
            <p className="mb-2 text-xs font-medium text-gray-500">Options</p>
            <div className="relative mb-2">
              <input
                value={newOpt}
                onChange={(e) => setNewOpt(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOption(); } }}
                placeholder="Find an option or create a new one"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-9 text-sm outline-none focus:border-blue-400"
              />
              <button type="button" aria-label="Add option" onClick={addOption} className="absolute right-2 top-1.5 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <ul className="space-y-1">
              {options.map((o, i) => (
                <li
                  key={o.id ?? `new-${i}`}
                  draggable
                  onDragStart={() => setDragIdx(i)}
                  onDragOver={(e) => { e.preventDefault(); }}
                  onDrop={() => { if (dragIdx !== null && dragIdx !== i) reorder(dragIdx, i); setDragIdx(null); }}
                  className="group flex items-center gap-2 rounded px-1 py-1 hover:bg-gray-50"
                >
                  <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-gray-300 group-hover:text-gray-400" />
                  <span className="flex flex-1 items-center gap-1.5 rounded bg-blue-50 px-1.5 py-0.5 focus-within:bg-white focus-within:ring-1 focus-within:ring-blue-400">
                    {field?.key === "theme" && o.value && THEME_META[o.value]?.emoji && (
                      <span className="shrink-0 text-sm leading-none">{THEME_META[o.value]!.emoji}</span>
                    )}
                    <input
                      value={o.label}
                      onChange={(e) => setOptions((os) => os.map((x, xi) => (xi === i ? { ...x, label: e.target.value } : x)))}
                      className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-blue-700 outline-none"
                    />
                  </span>
                  <button type="button" aria-label="Remove option" onClick={() => setOptions((os) => os.filter((_, xi) => xi !== i))} className="rounded p-1 text-gray-300 opacity-0 hover:bg-gray-100 hover:text-gray-600 group-hover:opacity-100">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
        <button type="button" onClick={() => void del()} disabled={busy} className="inline-flex items-center gap-1.5 rounded border border-gray-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50">
          <Trash2 className="h-4 w-4" /> Delete field
        </button>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button type="button" onClick={() => void save(true)} disabled={busy || !name.trim()} className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            Save
          </button>
        </div>
      </div>
    </aside>
  );
}

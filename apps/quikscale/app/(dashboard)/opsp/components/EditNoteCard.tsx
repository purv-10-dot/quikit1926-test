"use client";

import { useEffect, useState } from "react";
import { Check, X, PencilLine } from "lucide-react";
import type { PendingEdit } from "../lib/editLog";

function plain(s: string): string {
  // Strip HTML (rich-text fields store markup) and collapse whitespace.
  return s.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function Chip({ tone, value }: { tone: "old" | "new"; value: string }) {
  const text = plain(value) || "—";
  const cls =
    tone === "old"
      ? "bg-rose-50 text-rose-700 border-rose-200"
      : "bg-emerald-50 text-emerald-700 border-emerald-200";
  return (
    <span
      title={text}
      className={`inline-block max-w-[14rem] truncate align-middle px-2 py-0.5 text-xs rounded-md border ${cls}`}
    >
      {text}
    </span>
  );
}

/**
 * Inline "log this change" card shown beneath the field a user just edited on a
 * finalized OPSP. Autosave is OFF in this mode, so Save commits BOTH the value
 * change AND the optional note together; Cancel discards the unsaved change
 * (reverts the field). Both then dismiss the card.
 */
export function EditNoteCard({
  pending,
  saving,
  blocked = false,
  blockedReason,
  onSave,
  onCancel,
}: {
  pending: PendingEdit;
  saving: boolean;
  // When true, the change can't be committed yet (e.g. the Actions (QTR) grid
  // has a validation error) — Save is disabled and a reason is shown. Cancel
  // still works so the user can discard the unsaved change.
  blocked?: boolean;
  blockedReason?: string;
  onSave: (note: string) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState("");

  // Reset the note when a different field becomes pending. We intentionally do
  // NOT auto-focus the textarea — focusing it would yank the cursor out of the
  // field the user is still editing. They click into the note when ready.
  useEffect(() => {
    setNote("");
  }, [pending.field]);

  return (
    <div className="mt-2 rounded-xl border border-accent-200 bg-white shadow-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-accent-100 bg-accent-50">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-100">
          <PencilLine className="h-3.5 w-3.5 text-accent-600" />
        </span>
        <span className="text-xs font-semibold text-accent-800">Change logged</span>
        <span className="text-xs text-accent-700/80 truncate">· {pending.label}</span>
      </div>

      <div className="px-3 py-2.5 space-y-2.5">
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <Chip tone="old" value={pending.oldValue} />
          <span className="text-gray-400">→</span>
          <Chip tone="new" value={pending.newValue} />
        </div>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Add a note for this change (optional)…"
          className="w-full resize-none rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !blocked) onSave(note.trim());
            if (e.key === "Escape") onCancel();
          }}
        />

        {blocked && blockedReason && (
          <p className="text-[11px] font-medium text-red-500">{blockedReason}</p>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(note.trim())}
            disabled={saving || blocked}
            className="inline-flex items-center gap-1 rounded-lg bg-accent-600 px-3 py-1 text-xs font-semibold text-white hover:bg-accent-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check className="h-3.5 w-3.5" />
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

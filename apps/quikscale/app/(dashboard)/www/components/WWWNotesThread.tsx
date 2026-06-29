"use client";

/**
 * WWWNotesThread — chat-style note thread for a WWW item.
 *
 * - Add a note via the input + send button (anyone who can edit the item).
 * - History shows each note as a card: content · author · date · edit pencil.
 * - A note is editable by its author or an admin (pencil shown accordingly);
 *   the server (`canEditWWWNote`) is the source of truth.
 * - The history list scrolls once it grows past ~4 notes (fixed max-height).
 */

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Send, Pencil, Trash2, Loader2 } from "lucide-react";
import { useMyPermissions } from "@/lib/hooks/useMyPermissions";
import { useWWWNotes, useAddWWWNote, useEditWWWNote, useDeleteWWWNote, type WWWNote } from "@/lib/hooks/useWWWNotes";
import { notify } from "@/lib/utils/notify";

function authorName(note: WWWNote): string {
  const f = note.author?.firstName ?? "";
  const l = note.author?.lastName ?? "";
  return `${f} ${l}`.trim() || "Unknown";
}

function formatNoteDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

export function WWWNotesThread({
  itemId,
  canAddNotes,
  required = false,
  showRequiredError = false,
}: {
  itemId: string;
  canAddNotes: boolean;
  /** Org `www_notes_required` flag — shows a `*` on the header. */
  required?: boolean;
  /** When true, show the "add a note before saving" error under the composer
   *  (driven by the parent after a blocked Save). */
  showRequiredError?: boolean;
}) {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? "";
  const { isAdmin } = useMyPermissions();

  const { data: notes = [], isLoading } = useWWWNotes(itemId);
  const addNote = useAddWWWNote(itemId);
  const editNote = useEditWWWNote(itemId);
  const deleteNote = useDeleteWWWNote(itemId);

  const [input, setInput] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  async function handleAdd() {
    const content = input.trim();
    if (!content) return;
    try {
      await addNote.mutateAsync(content);
      setInput("");
      notify.success("Note added successfully");
    } catch (err: unknown) {
      notify.error(err, { context: "note", fallback: "Couldn't add the note. Please try again." });
    }
  }

  function startEdit(note: WWWNote) {
    setEditingId(note.id);
    setEditValue(note.content);
  }

  async function handleSaveEdit(noteId: string) {
    const content = editValue.trim();
    if (!content) return;
    try {
      await editNote.mutateAsync({ noteId, content });
      setEditingId(null);
      setEditValue("");
      notify.success("Note updated");
    } catch (err: unknown) {
      notify.error(err, { context: "note", fallback: "Couldn't update the note. Please try again." });
    }
  }

  async function handleDelete(noteId: string) {
    if (!window.confirm("Delete this note? This can't be undone.")) return;
    try {
      await deleteNote.mutateAsync(noteId);
      notify.success("Note deleted");
    } catch (err: unknown) {
      notify.error(err, { context: "note", fallback: "Couldn't delete the note. Please try again." });
    }
  }

  // Author or admin may edit/delete a note (server is the source of truth).
  const canModifyNote = (note: WWWNote) => note.authorId === currentUserId || isAdmin;

  return (
    <div className="pt-3 border-t border-gray-100">
      <h4 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
        Notes {required && <span className="text-red-500">*</span>}
      </h4>

      {/* Composer */}
      {canAddNotes && (
        <div className="relative mb-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter newline.
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleAdd(); }
            }}
            rows={2}
            placeholder="Share your thoughts, updates, or observations…"
            className="w-full px-3 py-2 pr-10 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 resize-none"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!input.trim() || addNote.isPending}
            title="Add note"
            aria-label="Add note"
            className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-accent-600 text-white hover:bg-accent-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {addNote.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </button>
        </div>
      )}

      {/* Notes-required error — shown after a blocked Save until a new note is
          added this session. Mirrors the create form's required Notes. */}
      {showRequiredError && (
        <p className="text-[10px] text-red-500 -mt-1 mb-3">Notes are required — add a note before saving.</p>
      )}

      {/* History */}
      <p className="text-[11px] font-semibold text-gray-500 mb-1.5">History</p>
      {isLoading ? (
        <p className="text-xs text-gray-400 italic">Loading notes…</p>
      ) : notes.length === 0 ? (
        <p className="text-xs text-gray-400 italic">No notes yet.</p>
      ) : (
        // Fixed max-height → scrolls once the thread passes ~4 notes.
        <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {notes.map((note) => {
            const editing = editingId === note.id;
            return (
              <li key={note.id} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                {editing ? (
                  <div className="space-y-1.5">
                    <textarea
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      rows={2}
                      autoFocus
                      className="w-full px-2.5 py-1.5 text-[11px] border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 resize-none"
                    />
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => { setEditingId(null); setEditValue(""); }}
                        className="px-2.5 py-1 text-[11px] border border-gray-200 rounded text-gray-500 hover:bg-gray-100 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(note.id)}
                        disabled={!editValue.trim() || editNote.isPending}
                        className="px-2.5 py-1 text-[11px] bg-accent-600 text-white rounded hover:bg-accent-700 disabled:opacity-40 transition-colors font-medium"
                      >
                        {editNote.isPending ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[11px] text-gray-700 whitespace-pre-wrap flex-1">{note.content}</p>
                      {canModifyNote(note) && (
                        <div className="flex flex-shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => startEdit(note)}
                            title="Edit note"
                            aria-label="Edit note"
                            className="text-gray-400 hover:text-accent-600 transition-colors"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(note.id)}
                            title="Delete note"
                            aria-label="Delete note"
                            className="text-gray-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-400">
                      <span className="font-medium text-gray-500">{authorName(note)}</span>
                      <span>·</span>
                      <span>{formatNoteDate(note.createdAt)}</span>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

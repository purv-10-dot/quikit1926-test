"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/hooks/use-toast";

/**
 * "Add Note" shortcut for a prospect.
 *
 * This is a thin convenience wrapper over the SAME pipeline the Log Activity
 * composer uses — `POST /api/activities` with `relatedKind: "Prospect"` and the
 * org's "Note" activity type. No separate notes table, no separate endpoint:
 * the row lands in CrmActivity exactly as a note logged from /activities/log
 * would, so it shows up in the prospect's timeline alongside everything else and
 * inherits the activity ACL unchanged.
 *
 * The prospect is passed in by the caller and never re-selected here — that is
 * the whole point of the shortcut. Unlike the full composer this deliberately
 * exposes only a notes textarea (no type picker, no record picker, no reminder,
 * no visibility selector); the "note" activity type is defined with zero custom
 * fields precisely because the generic Notes box is its entire form.
 */

type ActivityTypeDto = { id: string; code: string; label: string; isActive?: boolean };

/**
 * Resolve the org's "Note" activity type id.
 *
 * The composer sends `activityTypeId` alongside `type`, so we do the same rather
 * than posting a bare label — that keeps this note indistinguishable from one
 * logged through the normal flow. Types are matched on the stable `code`
 * ("note"), never the label, because admins can rename labels.
 */
async function fetchNoteType(): Promise<ActivityTypeDto> {
  const res = await fetch("/api/activities/types", { credentials: "include" });
  if (!res.ok) throw new Error("Could not load activity types");
  const json = (await res.json()) as { success: boolean; data?: ActivityTypeDto[] };
  const noteType = json.data?.find((t) => t.code === "note");
  if (!noteType) {
    // Only reachable if an admin deactivated/deleted the Note type for the org.
    throw new Error("No 'Note' activity type is configured for your organization");
  }
  return noteType;
}

export function AddProspectNoteModal({
  prospect,
  onClose,
  onSaved,
}: {
  /** The prospect the note attaches to. Null closes the modal. */
  prospect: { id: string; name: string } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset the textarea when the modal opens for a different prospect, so a
  // half-typed note never leaks from one row into another. Keyed on the id
  // rather than the object: the parent derives `prospect` with a find(), so a
  // new identity on every render would wipe the note as the user types.
  const prospectId = prospect?.id ?? null;
  useEffect(() => {
    if (prospectId) setNote("");
  }, [prospectId]);

  async function save() {
    const body = note.trim();
    if (!prospect || !body) return;

    setSaving(true);
    try {
      const noteType = await fetchNoteType();
      const res = await fetch("/api/activities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type: noteType.label,
          activityTypeId: noteType.id,
          relatedKind: "Prospect",
          relatedObjectId: prospect.id,
          detailNotes: body,
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error ?? "Failed to save note");
      }
      toast.success("Note added");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save note");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={Boolean(prospect)}
      onClose={onClose}
      title="Add Note"
      width="max-w-lg"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-crm-border bg-white px-3 py-1.5 text-sm font-medium text-crm-text hover:bg-crm-panel disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !note.trim()}
            className="rounded-md bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Note"}
          </button>
        </div>
      }
    >
      {prospect && (
        <div className="space-y-3">
          {/* The linked prospect, shown read-only — the user picked the row, so
              re-selecting it here would defeat the shortcut. */}
          <div className="flex items-center gap-2 rounded-lg border border-crm-border bg-crm-panel/40 px-3 py-2 text-sm">
            <span className="text-crm-muted">Prospect</span>
            <span className="font-medium text-crm-text">{prospect.name}</span>
          </div>

          <div>
            <label
              htmlFor="prospect-note-body"
              className="mb-1 block text-sm font-medium text-crm-text"
            >
              Note
            </label>
            <textarea
              id="prospect-note-body"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={6}
              autoFocus
              // Matches the API's detailNotes cap so the server can never reject
              // a note the textarea happily accepted.
              maxLength={5000}
              placeholder="Enter note…"
              className="w-full rounded-md border border-crm-border bg-white px-3 py-2 text-sm text-crm-text focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
            />
          </div>
        </div>
      )}
    </Modal>
  );
}

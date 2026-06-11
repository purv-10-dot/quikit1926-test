"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime } from "@/lib/utils/date-helpers";
import { LeadEmptyState } from "@/components/leads/dashboard/empty-state";
import { StickyNote } from "lucide-react";

export interface ContactNoteRow {
  id: string;
  content: string;
  createdAt: string;
}

export function ContactNotesTab({
  contactId,
  initialNotes,
  canCreate,
  onNoteAdded,
}: {
  contactId: string;
  initialNotes: ContactNoteRow[];
  canCreate: boolean;
  onNoteAdded?: () => void;
}) {
  const toast = useToast();
  const [notes, setNotes] = useState(initialNotes);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(
      `/api/notes?relatedObjectId=${encodeURIComponent(contactId)}`,
      { credentials: "include" },
    );
    const j = await res.json();
    if (!res.ok) throw new Error(j.error ?? "Failed to load notes");
    const rows: ContactNoteRow[] = Array.isArray(j.items)
      ? j.items
          .filter(
            (n: { relatedKind?: string }) =>
              (n.relatedKind ?? "").toLowerCase() === "contact",
          )
          .map(
            (n: { id: string; content: string; createdAt: string }) => ({
              id: n.id,
              content: n.content,
              createdAt:
                typeof n.createdAt === "string"
                  ? n.createdAt
                  : new Date(n.createdAt).toISOString(),
            }),
          )
      : [];
    setNotes(rows);
  }, [contactId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = content.trim();
    if (!text) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: text,
          relatedKind: "Contact",
          relatedObjectId: contactId,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed to save note");
      setContent("");
      await refresh();
      toast.success("Note saved");
      onNoteAdded?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save note");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {canCreate ? (
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-2">
          <textarea
            id="contact-note"
            className="min-h-[100px] w-full rounded border border-crm-border px-3 py-2 text-sm"
            placeholder="Add an internal note about this contact…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <Button type="submit" size="sm" disabled={submitting || !content.trim()}>
            {submitting ? "Saving…" : "Save note"}
          </Button>
        </form>
      ) : null}

      {notes.length === 0 ? (
        <LeadEmptyState
          icon={StickyNote}
          title="No notes"
          description="Capture context, meeting outcomes, or follow-ups."
        />
      ) : (
        <ul className="divide-y divide-crm-border rounded-lg border border-crm-border">
          {notes.map((n) => (
            <li key={n.id} className="px-3 py-3 text-sm">
              <p className="whitespace-pre-wrap text-crm-text">{n.content}</p>
              <p className="mt-1 text-xs text-crm-muted">{formatDateTime(n.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

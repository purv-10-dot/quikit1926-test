"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime } from "@/lib/utils/date-helpers";
import { LeadEmptyState } from "@/components/leads/dashboard/empty-state";
import { StickyNote } from "lucide-react";

export interface LeadNoteRow {
  id: string;
  content: string;
  createdAt: string;
}

interface Props {
  leadId: string;
  initialNotes: LeadNoteRow[];
  canCreate: boolean;
  onNoteAdded?: () => void;
}

export function LeadNotesTab({ leadId, initialNotes, canCreate, onNoteAdded }: Props) {
  const toast = useToast();
  const [notes, setNotes] = useState(initialNotes);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(
      `/api/notes?relatedObjectId=${encodeURIComponent(leadId)}`,
      { credentials: "include" },
    );
    const j = await res.json();
    if (!res.ok) throw new Error(j.error ?? "Failed to load notes");
    const rows: LeadNoteRow[] = Array.isArray(j.items)
      ? j.items.map((n: { id: string; content: string; createdAt: string }) => ({
          id: n.id,
          content: n.content,
          createdAt:
            typeof n.createdAt === "string" ? n.createdAt : new Date(n.createdAt).toISOString(),
        }))
      : [];
    setNotes(rows);
  }, [leadId]);

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
          relatedKind: "lead",
          relatedObjectId: leadId,
          leadId,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed to save note");
      setContent("");
      await refresh();
      onNoteAdded?.();
      toast.success("Note added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save note");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      {canCreate ? (
        <form onSubmit={(e) => void handleSubmit(e)} className="mb-6">
          <label htmlFor="lead-note" className="mb-1 block text-sm font-medium text-crm-text">
            Add note
          </label>
          <textarea
            id="lead-note"
            rows={3}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Internal note about this lead…"
            className="w-full rounded-lg border border-crm-border px-3 py-2 text-sm text-crm-text focus:outline-none focus:ring-2 focus:ring-accent-400"
          />
          <div className="mt-2 flex justify-end">
            <Button type="submit" disabled={submitting || !content.trim()}>
              {submitting ? "Saving…" : "Save note"}
            </Button>
          </div>
        </form>
      ) : null}

      {notes.length === 0 ? (
        <LeadEmptyState
          icon={StickyNote}
          title="No notes yet"
          description="Capture internal context, call summaries, and decisions your team should remember."
          actionLabel={canCreate ? "Add first note" : undefined}
          onAction={canCreate ? () => document.getElementById("lead-note")?.focus() : undefined}
        />
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => (
            <li
              key={n.id}
              className="rounded-lg border border-crm-border bg-white px-4 py-3 text-sm shadow-sm"
            >
              <p className="whitespace-pre-wrap text-crm-text">{n.content}</p>
              <p className="mt-2 text-xs text-crm-muted">{formatDateTime(n.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

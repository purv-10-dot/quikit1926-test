"use client";

import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime } from "@/lib/utils/date-helpers";
import { LeadEmptyState } from "@/components/leads/dashboard/empty-state";
import { StickyNote } from "lucide-react";
import {
  ACCOUNT_NOTE_CATEGORIES,
  type AccountNoteCategoryId,
  categoryLabel,
} from "@/lib/accounts/account-note-category";

export interface AccountNoteRow {
  id: string;
  content: string;
  createdAt: string;
  noteCategory?: AccountNoteCategoryId;
}

interface Props {
  accountId: string;
  initialNotes: AccountNoteRow[];
  canCreate: boolean;
  onNoteAdded?: () => void;
}

export function AccountNotesTab({
  accountId,
  initialNotes,
  canCreate,
  onNoteAdded,
}: Props) {
  const toast = useToast();
  const [notes, setNotes] = useState(initialNotes);
  const [category, setCategory] = useState<AccountNoteCategoryId>("internal");
  const [filter, setFilter] = useState<AccountNoteCategoryId | "all">("all");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(
      `/api/notes?relatedObjectId=${encodeURIComponent(accountId)}`,
      { credentials: "include" },
    );
    const j = await res.json();
    if (!res.ok) throw new Error(j.error ?? "Failed to load notes");
    const rows: AccountNoteRow[] = Array.isArray(j.items)
      ? j.items
          .filter(
            (n: { relatedKind?: string }) =>
              (n.relatedKind ?? "").toLowerCase() === "account",
          )
          .map(
            (n: {
              id: string;
              content: string;
              createdAt: string;
              noteCategory?: AccountNoteCategoryId;
            }) => ({
              id: n.id,
              content: n.content,
              noteCategory: n.noteCategory,
              createdAt:
                typeof n.createdAt === "string"
                  ? n.createdAt
                  : new Date(n.createdAt).toISOString(),
            }),
          )
      : [];
    setNotes(rows);
  }, [accountId]);

  const filtered = useMemo(() => {
    if (filter === "all") return notes;
    return notes.filter((n) => (n.noteCategory ?? "internal") === filter);
  }, [notes, filter]);

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
          relatedKind: "Account",
          relatedObjectId: accountId,
          noteCategory: category,
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
      <div className="mb-4 flex flex-wrap gap-1">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          All
        </FilterChip>
        {ACCOUNT_NOTE_CATEGORIES.map((c) => (
          <FilterChip
            key={c.id}
            active={filter === c.id}
            onClick={() => setFilter(c.id)}
          >
            {c.label}
          </FilterChip>
        ))}
      </div>

      {canCreate ? (
        <form onSubmit={(e) => void handleSubmit(e)} className="mb-6 rounded-xl border border-crm-border bg-white p-4">
          <label htmlFor="account-note" className="mb-2 block text-sm font-medium text-crm-text">
            Add note
          </label>
          <div className="mb-2 flex flex-wrap gap-1">
            {ACCOUNT_NOTE_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                className={
                  "rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 " +
                  (category === c.id
                    ? "bg-accent-100 text-accent-800 ring-accent-300"
                    : "bg-crm-panel text-crm-muted ring-crm-border hover:text-crm-text")
                }
              >
                {c.label}
              </button>
            ))}
          </div>
          <textarea
            id="account-note"
            rows={4}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={`${categoryLabel(category)}…`}
            className="w-full rounded-lg border border-crm-border px-3 py-2 text-sm text-crm-text focus:outline-none focus:ring-2 focus:ring-accent-400"
          />
          <div className="mt-2 flex justify-end">
            <Button type="submit" disabled={submitting || !content.trim()}>
              {submitting ? "Saving…" : "Save note"}
            </Button>
          </div>
        </form>
      ) : null}

      {filtered.length === 0 ? (
        <LeadEmptyState
          icon={StickyNote}
          title="No notes in this category"
          description="Capture internal context, strategy, meeting summaries, and account risks."
          actionLabel={canCreate ? "Add note" : undefined}
          onAction={canCreate ? () => document.getElementById("account-note")?.focus() : undefined}
        />
      ) : (
        <ul className="space-y-3">
          {filtered.map((n) => (
            <li
              key={n.id}
              className="rounded-lg border border-crm-border bg-white px-4 py-3 text-sm shadow-sm"
            >
              <span className="mb-2 inline-block rounded-full bg-crm-panel px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-crm-muted">
                {categoryLabel(n.noteCategory ?? "internal")}
              </span>
              <p className="whitespace-pre-wrap text-crm-text">{n.content}</p>
              <p className="mt-2 text-xs text-crm-muted">{formatDateTime(n.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterChip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-lg px-2.5 py-1 text-xs font-medium transition " +
        (active ? "bg-accent-600 text-white" : "bg-crm-panel text-crm-muted hover:text-crm-text")
      }
    >
      {children}
    </button>
  );
}

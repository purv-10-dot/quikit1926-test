"use client";

/**
 * WWW note-thread hooks. A WWW item owns a thread of discrete notes (WWWNote),
 * each editable by its author/admin — mirrors the KPI note pattern, plus edit.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface WWWNote {
  id: string;
  content: string;
  authorId: string;
  createdAt: string;
  updatedAt: string;
  author?: { firstName: string | null; lastName: string | null } | null;
}

const notesKey = (wwwItemId: string) => ["www", wwwItemId, "notes"] as const;

async function readJson<T>(res: Response, fallback: string): Promise<T> {
  const json = await res.json();
  if (!json.success) throw new Error(json.error || fallback);
  return json.data as T;
}

/** List a WWW item's notes (newest first). */
export function useWWWNotes(wwwItemId: string) {
  return useQuery({
    queryKey: notesKey(wwwItemId),
    queryFn: async () =>
      readJson<WWWNote[]>(await fetch(`/api/www/${wwwItemId}/notes`), "Failed to load notes"),
    enabled: !!wwwItemId,
    staleTime: 1000 * 60 * 5,
  });
}

/** Add a note to the thread. */
export function useAddWWWNote(wwwItemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (content: string) =>
      readJson<WWWNote>(
        await fetch(`/api/www/${wwwItemId}/notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        }),
        "Failed to add note",
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: notesKey(wwwItemId) }),
  });
}

/** Edit an existing note's content (author/admin only — enforced server-side). */
export function useEditWWWNote(wwwItemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ noteId, content }: { noteId: string; content: string }) =>
      readJson<WWWNote>(
        await fetch(`/api/www/${wwwItemId}/notes/${noteId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        }),
        "Failed to update note",
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: notesKey(wwwItemId) }),
  });
}

/** Delete a note (author/admin only — enforced server-side). */
export function useDeleteWWWNote(wwwItemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (noteId: string) => {
      const res = await fetch(`/api/www/${wwwItemId}/notes/${noteId}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to delete note");
      return noteId;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: notesKey(wwwItemId) }),
  });
}

"use client";

/**
 * Per-channel, per-user composer drafts.
 *
 * localStorage-only, one key per (userId, channelId) — same rationale as
 * media-devices.ts (per-machine, never server-synced), plus a userId segment
 * so two people on a shared machine never see each other's half-typed text.
 * Logout already wipes ALL localStorage (packages/ui/lib/global-signout.ts
 * calls localStorage.clear() on every sign-out), so this module only has to
 * handle send-clears and staleness, not logout.
 *
 * The stored `doc` is a Tiptap/ProseMirror JSON document (Editor#getJSON()),
 * not markdown or plain text — restoring plain text would lose bold/italic/
 * strike/code, and there is no markdown→Tiptap parser in this codebase to
 * restore markdown faithfully either. `v` is a schema-shape version: bump it
 * on any future breaking change to what's stored, and old entries are simply
 * ignored (not migrated) — see the caller's setContent try/catch for the
 * runtime half of that guarantee.
 */

export const DRAFT_STORAGE_PREFIX = "qc.draft.v1.";

/** A draft older than this reads as more surprising than useful — treat it as gone. */
export const DRAFT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export interface StoredDraft {
  v: 1;
  doc: unknown;
  updatedAt: number;
}

function draftKey(userId: string, channelId: string): string {
  return `${DRAFT_STORAGE_PREFIX}${userId}.${channelId}`;
}

/** The saved draft doc for one user+channel, or null if none/expired/malformed. */
export function getDraft(userId: string, channelId: string): unknown | null {
  if (typeof window === "undefined" || !userId || !channelId) return null;
  try {
    const raw = window.localStorage.getItem(draftKey(userId, channelId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDraft>;
    // Any shape this module didn't write itself — wrong version, missing
    // fields, or (below) a JSON.parse failure — self-heals by deleting the
    // entry rather than leaving it to fail the same way on every future read.
    if (parsed?.v !== 1 || parsed.doc == null || typeof parsed.updatedAt !== "number") {
      clearDraft(userId, channelId);
      return null;
    }
    if (Date.now() - parsed.updatedAt > DRAFT_TTL_MS) {
      clearDraft(userId, channelId);
      return null;
    }
    return parsed.doc;
  } catch {
    clearDraft(userId, channelId);
    return null;
  }
}

/** Persist a draft doc. Callers must not call this with an empty document. */
export function saveDraft(userId: string, channelId: string, doc: unknown): void {
  if (typeof window === "undefined" || !userId || !channelId) return;
  try {
    const entry: StoredDraft = { v: 1, doc, updatedAt: Date.now() };
    window.localStorage.setItem(draftKey(userId, channelId), JSON.stringify(entry));
  } catch {
    // Quota / private mode — the draft just doesn't survive; never block typing on it.
  }
}

export function clearDraft(userId: string, channelId: string): void {
  if (typeof window === "undefined" || !userId || !channelId) return;
  try {
    window.localStorage.removeItem(draftKey(userId, channelId));
  } catch {
    // ignore
  }
}

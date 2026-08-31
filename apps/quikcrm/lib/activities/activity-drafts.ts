/**
 * Client-only helpers for the Log-activity composer drafts.
 *
 * Drafts are saved unfinished composer forms — NOT real CrmActivity rows. They
 * live entirely in this browser's localStorage (nothing hits the API/DB), so
 * they are device-local and never appear in the DB-backed activities table.
 *
 * Two storage shapes exist:
 *   • v2 (`DRAFTS_STORAGE_KEY`) — the named-drafts collection (an array). New
 *     drafts append here.
 *   • v1 (`DRAFT_STORAGE_KEY`) — the legacy single-draft key, kept readable for
 *     backward-compat display. Not written to any more.
 *
 * This module is the single source of truth for the keys + `NamedDraft` shape so
 * the composer (which writes drafts) and the Drafts list (which reads/deletes
 * them) can never drift apart on the magic strings. Client-safe: guards every
 * `localStorage` access for SSR.
 */
import type { ActivityVisibility } from "@/lib/activities/activity-type-meta";

// Legacy single-draft key (v1) — read-only for backward-compat display.
export const DRAFT_STORAGE_KEY = "quikcrm.activity-composer.draft.v1";
// Named-drafts collection (v2) — the array new drafts append to.
export const DRAFTS_STORAGE_KEY = "quikcrm.activity-composer.drafts.v2";

/**
 * Every lookup kind plus the standalone sentinel, mirroring the composer.
 *
 * Deliberately spelled out here rather than imported from
 * `services/activities/target-existence`: this module is client-only, and that
 * one imports the Prisma client at module scope. A `import type` would be erased
 * at build time, but keeping a server module out of this file's import graph
 * entirely means no future non-type import can accidentally pull Prisma into the
 * browser bundle. Kept in sync with ACTIVITY_KINDS — adding a kind there means
 * adding it here.
 */
export type DraftRelatedKind =
  | "None"
  | "Lead"
  | "Opportunity"
  | "Contact"
  | "Account"
  | "Prospect"
  | "Upwork";

export type NamedDraft = {
  id: string;
  name: string;
  activityTypeId?: string;
  relatedKind?: DraftRelatedKind;
  relatedObjectId?: string;
  activityNotes?: string;
  visibility?: ActivityVisibility;
  savedAt: string;
};

/** A draft normalised for list display — v2 entries and the legacy v1 draft. */
export type DraftListEntry = {
  /** Stable storage id. `DRAFT_STORAGE_KEY` marks the legacy v1 entry. */
  key: string;
  /** Display name, or a "Draft · <date>" fallback when unnamed. */
  label: string;
  savedAt: Date | null;
  /** The underlying draft; `undefined` for the legacy v1 entry. */
  draft: NamedDraft | undefined;
};

const canUseStorage = () => typeof window !== "undefined" && !!window.localStorage;

/** Read the v2 named-drafts collection. Returns [] on SSR or malformed data. */
export function readNamedDrafts(): NamedDraft[] {
  if (!canUseStorage()) return [];
  try {
    const raw = localStorage.getItem(DRAFTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as NamedDraft[]) : [];
  } catch {
    return [];
  }
}

/** Read the legacy v1 single draft, if present. Returns null otherwise. */
export function readLegacyDraft(): NamedDraft | null {
  if (!canUseStorage()) return null;
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NamedDraft;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * List every saved draft for display: the named v2 drafts (by custom name)
 * followed by the legacy v1 draft (by timestamp), newest first within v2.
 */
export function listDraftEntries(): DraftListEntry[] {
  const entries: DraftListEntry[] = [];
  for (const d of readNamedDrafts()) {
    const savedAt = d.savedAt ? new Date(d.savedAt) : null;
    entries.push({
      key: d.id,
      label: d.name?.trim() || (savedAt ? `Draft · ${savedAt.toLocaleString()}` : "Saved draft"),
      savedAt: savedAt && !Number.isNaN(savedAt.getTime()) ? savedAt : null,
      draft: d,
    });
  }
  const legacy = readLegacyDraft();
  if (legacy) {
    const savedAt = legacy.savedAt ? new Date(legacy.savedAt) : null;
    entries.push({
      key: DRAFT_STORAGE_KEY,
      label:
        legacy.name?.trim() ||
        (savedAt ? `Draft · ${savedAt.toLocaleString()}` : "Saved draft"),
      savedAt: savedAt && !Number.isNaN(savedAt.getTime()) ? savedAt : null,
      draft: undefined,
    });
  }
  // Newest first: entries without a valid savedAt sort last.
  entries.sort((a, b) => (b.savedAt?.getTime() ?? 0) - (a.savedAt?.getTime() ?? 0));
  return entries;
}

/**
 * Delete a draft by its storage key. Removing the legacy v1 entry clears its
 * dedicated key; removing a v2 entry rewrites the collection without it.
 * Returns true if something was removed.
 */
export function deleteDraft(key: string): boolean {
  if (!canUseStorage()) return false;
  try {
    if (key === DRAFT_STORAGE_KEY) {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      return true;
    }
    const drafts = readNamedDrafts();
    const next = drafts.filter((d) => d.id !== key);
    if (next.length === drafts.length) return false;
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

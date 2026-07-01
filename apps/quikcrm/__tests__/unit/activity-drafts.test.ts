// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  DRAFT_STORAGE_KEY,
  DRAFTS_STORAGE_KEY,
  deleteDraft,
  listDraftEntries,
  readLegacyDraft,
  readNamedDrafts,
  type NamedDraft,
} from "@/lib/activities/activity-drafts";

function makeDraft(over: Partial<NamedDraft> = {}): NamedDraft {
  return {
    id: `${DRAFTS_STORAGE_KEY}:${over.savedAt ?? "2026-01-01T00:00:00.000Z"}`,
    name: "My draft",
    activityTypeId: "type-1",
    relatedKind: "Lead",
    relatedObjectId: "lead-1",
    activityNotes: "some notes",
    visibility: "team",
    savedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

afterEach(() => {
  localStorage.clear();
});

describe("activity-drafts", () => {
  it("reads an empty collection when nothing is stored", () => {
    expect(readNamedDrafts()).toEqual([]);
    expect(readLegacyDraft()).toBeNull();
    expect(listDraftEntries()).toEqual([]);
  });

  it("returns [] for malformed v2 data instead of throwing", () => {
    localStorage.setItem(DRAFTS_STORAGE_KEY, "{not json");
    expect(readNamedDrafts()).toEqual([]);
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify({ not: "an array" }));
    expect(readNamedDrafts()).toEqual([]);
  });

  it("lists v2 drafts newest-first", () => {
    const older = makeDraft({ id: "d-old", name: "Older", savedAt: "2026-01-01T00:00:00.000Z" });
    const newer = makeDraft({ id: "d-new", name: "Newer", savedAt: "2026-06-01T00:00:00.000Z" });
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify([older, newer]));

    const entries = listDraftEntries();
    expect(entries.map((e) => e.key)).toEqual(["d-new", "d-old"]);
    expect(entries[0]!.label).toBe("Newer");
  });

  it("falls back to a timestamp label when a draft is unnamed", () => {
    const unnamed = makeDraft({ id: "d1", name: "", savedAt: "2026-03-04T05:06:00.000Z" });
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify([unnamed]));
    expect(listDraftEntries()[0]!.label).toMatch(/^Draft ·/);
  });

  it("includes the legacy v1 draft as an entry with no inline payload", () => {
    localStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({ name: "Legacy", savedAt: "2026-02-02T00:00:00.000Z" }),
    );
    const entries = listDraftEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.key).toBe(DRAFT_STORAGE_KEY);
    expect(entries[0]!.label).toBe("Legacy");
    // The v1 entry has no inline draft payload — the composer restores it itself.
    expect(entries[0]!.draft).toBeUndefined();
  });

  it("deletes a v2 draft by id, leaving the others", () => {
    const a = makeDraft({ id: "a", name: "A" });
    const b = makeDraft({ id: "b", name: "B" });
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify([a, b]));

    expect(deleteDraft("a")).toBe(true);
    expect(readNamedDrafts().map((d) => d.id)).toEqual(["b"]);
  });

  it("returns false when deleting a non-existent id", () => {
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify([makeDraft({ id: "a" })]));
    expect(deleteDraft("missing")).toBe(false);
    expect(readNamedDrafts()).toHaveLength(1);
  });

  it("deletes the legacy v1 draft by its dedicated key", () => {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ name: "Legacy" }));
    expect(deleteDraft(DRAFT_STORAGE_KEY)).toBe(true);
    expect(readLegacyDraft()).toBeNull();
  });
});

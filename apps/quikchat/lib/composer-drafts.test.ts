// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearDraft, DRAFT_TTL_MS, getDraft, saveDraft } from "./composer-drafts";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("composer-drafts", () => {
  it("returns null when nothing is stored", () => {
    expect(getDraft("u1", "c1")).toBeNull();
  });

  it("round-trips a saved doc", () => {
    const doc = { type: "doc", content: [{ type: "paragraph" }] };
    saveDraft("u1", "c1", doc);
    expect(getDraft("u1", "c1")).toEqual(doc);
  });

  it("keeps drafts for different channels independent", () => {
    saveDraft("u1", "c1", { text: "for c1" });
    saveDraft("u1", "c2", { text: "for c2" });
    expect(getDraft("u1", "c1")).toEqual({ text: "for c1" });
    expect(getDraft("u1", "c2")).toEqual({ text: "for c2" });
  });

  it("keeps drafts for different users on the same channel independent", () => {
    saveDraft("alice", "c1", { text: "alice's draft" });
    saveDraft("bob", "c1", { text: "bob's draft" });
    expect(getDraft("alice", "c1")).toEqual({ text: "alice's draft" });
    expect(getDraft("bob", "c1")).toEqual({ text: "bob's draft" });
  });

  it("clearDraft removes the entry", () => {
    saveDraft("u1", "c1", { text: "x" });
    clearDraft("u1", "c1");
    expect(getDraft("u1", "c1")).toBeNull();
  });

  it("treats a draft older than the TTL as gone, and deletes it", () => {
    const now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    saveDraft("u1", "c1", { text: "stale" });

    vi.spyOn(Date, "now").mockReturnValue(now + DRAFT_TTL_MS + 1);
    expect(getDraft("u1", "c1")).toBeNull();

    // Self-healed: the expired key is gone, not just skipped.
    vi.spyOn(Date, "now").mockReturnValue(now);
    expect(getDraft("u1", "c1")).toBeNull();
  });

  it("ignores a malformed stored value and deletes it", () => {
    localStorage.setItem("qc.draft.v1.u1.c1", "not json");
    expect(getDraft("u1", "c1")).toBeNull();
    expect(localStorage.getItem("qc.draft.v1.u1.c1")).toBeNull();
  });

  it("ignores an entry with the wrong version tag and deletes it", () => {
    localStorage.setItem(
      "qc.draft.v1.u1.c1",
      JSON.stringify({ v: 2, doc: { text: "future shape" }, updatedAt: Date.now() }),
    );
    expect(getDraft("u1", "c1")).toBeNull();
    expect(localStorage.getItem("qc.draft.v1.u1.c1")).toBeNull();
  });

  it("ignores an entry missing required fields and deletes it", () => {
    localStorage.setItem("qc.draft.v1.u1.c1", JSON.stringify({ v: 1 }));
    expect(getDraft("u1", "c1")).toBeNull();
    expect(localStorage.getItem("qc.draft.v1.u1.c1")).toBeNull();
  });

  it("saveDraft and getDraft never throw when localStorage access throws", () => {
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });

    expect(() => saveDraft("u1", "c1", { text: "x" })).not.toThrow();
    expect(() => getDraft("u1", "c1")).not.toThrow();
    expect(getDraft("u1", "c1")).toBeNull();

    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
  });

  it("clearDraft never throws when localStorage access throws", () => {
    const removeItemSpy = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => clearDraft("u1", "c1")).not.toThrow();
    removeItemSpy.mockRestore();
  });

  it("no-ops without a window (SSR)", () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error simulate SSR
    delete globalThis.window;
    expect(() => saveDraft("u1", "c1", { text: "x" })).not.toThrow();
    expect(getDraft("u1", "c1")).toBeNull();
    expect(() => clearDraft("u1", "c1")).not.toThrow();
    globalThis.window = originalWindow;
  });
});

import type { MessageDto } from "@/lib/shared";
import { describe, expect, it } from "vitest";
import { patchMessageEvent } from "./realtime-cache";
import {
  applyDeleteOptimistic,
  applyEditOptimistic,
  applyPinOptimistic,
  toggleReactionOptimistic,
  updateInList,
} from "./message-actions";

const mk = (over: Partial<MessageDto> & { id: string }): MessageDto => ({
  channelId: "c1",
  senderId: "me",
  actorType: "human",
  type: "Text",
  content: "hi",
  data: null,
  parentMessageId: null,
  parentPreview: null,
  isPinned: false,
  reactions: [],
  mentions: [],
  createdAt: new Date("2026-05-08T12:00:00Z").toISOString(),
  editedAt: null,
  ...over,
});

describe("toggleReactionOptimistic", () => {
  it("adds the caller's reaction", () => {
    const out = toggleReactionOptimistic(mk({ id: "a" }), "👍", "me");
    expect(out.reactions).toEqual([{ emoji: "👍", count: 1, userIds: ["me"] }]);
  });
  it("removes when already reacted, dropping the emoji at zero", () => {
    const msg = mk({ id: "a", reactions: [{ emoji: "👍", count: 1, userIds: ["me"] }] });
    expect(toggleReactionOptimistic(msg, "👍", "me").reactions).toEqual([]);
  });
  it("keeps other reactors when one removes", () => {
    const msg = mk({ id: "a", reactions: [{ emoji: "👍", count: 2, userIds: ["me", "bob"] }] });
    expect(toggleReactionOptimistic(msg, "👍", "me").reactions).toEqual([
      { emoji: "👍", count: 1, userIds: ["bob"] },
    ]);
  });
});

describe("optimistic edit/delete/pin", () => {
  it("edit sets content, mentions, editedAt", () => {
    const out = applyEditOptimistic(mk({ id: "a" }), "new", [], "2026-05-08T12:05:00Z");
    expect(out.content).toBe("new");
    expect(out.editedAt).toBe("2026-05-08T12:05:00Z");
  });
  it("delete tombstones", () => {
    const out = applyDeleteOptimistic(
      mk({ id: "a", content: "x", reactions: [{ emoji: "👍", count: 1, userIds: ["me"] }] }),
    );
    expect(out.type).toBe("Delete");
    expect(out.content).toBe("");
    expect(out.reactions).toEqual([]);
  });
  it("pin flips isPinned", () => {
    expect(applyPinOptimistic(mk({ id: "a" }), true).isPinned).toBe(true);
  });
});

describe("optimistic + realtime echo de-dupe", () => {
  it("echo (patchMessageEvent) reconciles by id without duplicating", () => {
    let list = [mk({ id: "a" })];
    list = updateInList(list, "a", (m) => toggleReactionOptimistic(m, "👍", "me"));
    // authoritative echo for the same id
    const echo = mk({ id: "a", reactions: [{ emoji: "👍", count: 2, userIds: ["me", "bob"] }] });
    const merged = patchMessageEvent(list, echo);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.reactions[0]!.count).toBe(2);
  });
});

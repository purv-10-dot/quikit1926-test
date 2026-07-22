import type { ChannelList, ChannelListItem, MessageDto } from "@/lib/shared";
import { describe, expect, it } from "vitest";
import {
  applyDeliveredEvent,
  applyReadEvent,
  bumpChannelList,
  markChannelRead,
  mergeMessageEvent,
  patchMessageEvent,
  prependOlder,
  seedFromApiPage,
  shouldApplyDelivered,
  shouldApplyRead,
  sortMessagesAsc,
} from "./realtime-cache";

const msg = (over: Partial<MessageDto> & { id: string }): MessageDto => ({
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

const at = (id: string, iso: string) => msg({ id, createdAt: new Date(iso).toISOString() });

describe("ascending ordering (Bug 1)", () => {
  it("seedFromApiPage reverses a newest-first page into ascending", () => {
    // API returns newest-first.
    const apiPage = [
      at("c", "2026-05-08T12:02:00Z"),
      at("b", "2026-05-08T12:01:00Z"),
      at("a", "2026-05-08T12:00:00Z"),
    ];
    expect(seedFromApiPage(apiPage).map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("sortMessagesAsc is stable on equal timestamps (tiebreak id)", () => {
    const same = "2026-05-08T12:00:00Z";
    const out = sortMessagesAsc([at("b", same), at("a", same)]);
    expect(out.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("prependOlder puts an older page in front, ascending + de-duped", () => {
    const existing = [at("c", "2026-05-08T12:02:00Z"), at("d", "2026-05-08T12:03:00Z")];
    const olderPage = [
      at("b", "2026-05-08T12:01:00Z"),
      at("a", "2026-05-08T12:00:00Z"),
      at("c", "2026-05-08T12:02:00Z"), // dup → dropped
    ];
    expect(prependOlder(existing, olderPage).map((m) => m.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("an optimistic send + its echo stay at the bottom (no reorder)", () => {
    const list = [at("a", "2026-05-08T12:00:00Z"), at("b", "2026-05-08T12:01:00Z")];
    const optimistic = msg({
      id: "temp-1",
      clientMessageId: "cm-1",
      createdAt: new Date("2026-05-08T12:05:00Z").toISOString(),
    });
    const withTemp = sortMessagesAsc([...list, optimistic]);
    expect(withTemp.at(-1)!.id).toBe("temp-1");
    const echo = msg({
      id: "server-1",
      clientMessageId: "cm-1",
      createdAt: new Date("2026-05-08T12:05:01Z").toISOString(),
    });
    const merged = sortMessagesAsc(mergeMessageEvent(withTemp, echo, "me"));
    expect(merged.at(-1)!.id).toBe("server-1");
    expect(merged).toHaveLength(3);
  });
});

describe("mergeMessageEvent", () => {
  it("appends a new message", () => {
    const out = mergeMessageEvent([msg({ id: "a" })], msg({ id: "b" }), "me");
    expect(out.map((m) => m.id)).toEqual(["a", "b"]);
  });
  it("is idempotent on re-delivery (replaces, no dup)", () => {
    const list = [msg({ id: "a", content: "old" })];
    const out = mergeMessageEvent(list, msg({ id: "a", content: "new" }), "me");
    expect(out).toHaveLength(1);
    expect(out[0]!.content).toBe("new");
  });
  it("reconciles the optimistic temp row in place (content fallback)", () => {
    const list = [msg({ id: "x" }), msg({ id: "temp-1", senderId: "me", content: "yo" })];
    const out = mergeMessageEvent(list, msg({ id: "real-1", senderId: "me", content: "yo" }), "me");
    expect(out).toHaveLength(2);
    expect(out.map((m) => m.id)).toEqual(["x", "real-1"]);
  });
  it("reconciles exactly by clientMessageId even when content differs", () => {
    const list = [msg({ id: "temp-1", senderId: "me", content: "draft", clientMessageId: "c1" })];
    const out = mergeMessageEvent(
      list,
      msg({ id: "real-1", senderId: "me", content: "final", clientMessageId: "c1" }),
      "me",
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("real-1");
  });
});

describe("patchMessageEvent", () => {
  it("replaces a known row, ignores unknown", () => {
    const list = [msg({ id: "a", content: "old" })];
    expect(patchMessageEvent(list, msg({ id: "a", content: "edited" }))[0]!.content).toBe("edited");
    expect(patchMessageEvent(list, msg({ id: "zzz" }))).toBe(list);
  });
});

const chan = (over: Partial<ChannelListItem> & { channelId: string }): ChannelListItem => ({
  name: over.channelId,
  avatarUrl: null,
  type: "group",
  visibility: "public",
  isPriority: false,
  unreadCount: 0,
  lastActivityAt: new Date("2026-05-08T10:00:00Z").toISOString(),
  members: [],
  memberReadAt: {},
  memberDeliveredAt: {},
  lastMessage: null,
  ...over,
});

const last = (id: string) => ({
  id,
  type: "Text",
  content: "new",
  senderId: "other",
  createdAt: new Date("2026-05-08T13:00:00Z").toISOString(),
});

describe("bumpChannelList", () => {
  const state: ChannelList = {
    priority: [],
    recent: [chan({ channelId: "c1" }), chan({ channelId: "c2" })],
  };

  it("increments unread for an inbound message in a non-active channel and moves it to front", () => {
    const out = bumpChannelList(state, "c2", last("m1"), { active: false, fromSelf: false });
    expect(out.recent.map((c) => c.channelId)).toEqual(["c2", "c1"]);
    expect(out.recent[0]!.unreadCount).toBe(1);
  });
  it("does not increment for the active channel (resets to 0)", () => {
    const out = bumpChannelList(state, "c1", last("m1"), { active: true, fromSelf: false });
    expect(out.recent.find((c) => c.channelId === "c1")!.unreadCount).toBe(0);
  });
  it("does not increment for your own message", () => {
    const out = bumpChannelList(state, "c1", last("m1"), { active: false, fromSelf: true });
    expect(out.recent.find((c) => c.channelId === "c1")!.unreadCount).toBe(0);
  });
  it("leaves unknown channels untouched", () => {
    expect(bumpChannelList(state, "nope", last("m1"), { active: false, fromSelf: false })).toBe(
      state,
    );
  });
});

describe("markChannelRead", () => {
  it("clears the unread badge", () => {
    const state: ChannelList = {
      priority: [],
      recent: [chan({ channelId: "c1", unreadCount: 5 })],
    };
    expect(markChannelRead(state, "c1").recent[0]!.unreadCount).toBe(0);
  });
});

describe("applyReadEvent (live read receipts)", () => {
  const created = new Date("2026-05-08T12:00:00Z").toISOString();
  const state: ChannelList = {
    priority: [],
    recent: [chan({ channelId: "c1", memberReadAt: {} })],
  };

  it("merges another member's read into memberReadAt", () => {
    const next = applyReadEvent(state, "c1", "bob", "2026-05-08T12:05:00Z");
    expect(next.recent[0]!.memberReadAt.bob).toBe("2026-05-08T12:05:00Z");
  });

  it("leaves unknown channels untouched", () => {
    expect(applyReadEvent(state, "nope", "bob", created)).toEqual(state);
  });

  it("shouldApplyRead ignores the current user's own read", () => {
    expect(shouldApplyRead("me", "me")).toBe(false);
    expect(shouldApplyRead("bob", "me")).toBe(true);
  });
});

describe("applyDeliveredEvent (S14a)", () => {
  const state: ChannelList = {
    priority: [],
    recent: [chan({ channelId: "c1" })],
  };

  it("merges a member's delivered watermark into memberDeliveredAt", () => {
    const next = applyDeliveredEvent(state, "c1", "bob", "2026-05-08T12:05:00Z");
    expect(next.recent[0]!.memberDeliveredAt.bob).toBe("2026-05-08T12:05:00Z");
  });

  it("never moves a watermark backwards (monotonic)", () => {
    const seeded: ChannelList = {
      priority: [],
      recent: [chan({ channelId: "c1", memberDeliveredAt: { bob: "2026-05-08T12:05:00Z" } })],
    };
    const next = applyDeliveredEvent(seeded, "c1", "bob", "2026-05-08T12:00:00Z");
    expect(next.recent[0]!.memberDeliveredAt.bob).toBe("2026-05-08T12:05:00Z");
  });

  it("shouldApplyDelivered ignores the current user's own delivered", () => {
    expect(shouldApplyDelivered("me", "me")).toBe(false);
    expect(shouldApplyDelivered("bob", "me")).toBe(true);
  });
});

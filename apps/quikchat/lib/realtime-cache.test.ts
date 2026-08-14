import type { ChannelList, ChannelListItem, MessageDto } from "@/lib/shared";
import { describe, expect, it } from "vitest";
import {
  applyChannelUpdated,
  applyDeliveredEvent,
  applyReadEvent,
  bumpChannelList,
  dmChannelIdsWithMember,
  markChannelRead,
  mergeMessageEvent,
  patchMessageEvent,
  prependOlder,
  removeChannelFromList,
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

  it("dedupes stale optimistic and server rows that share the same logical message", () => {
    const list = [
      msg({ id: "temp-1", senderId: "me", content: "draft", clientMessageId: "c1" }),
      msg({ id: "real-1", senderId: "me", content: "final", clientMessageId: "c1" }),
    ];
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
  description: null,
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

describe("dmChannelIdsWithMember (last-seen invalidation scope)", () => {
  const user = (id: string) => ({ id, displayName: id, avatarUrl: null });
  const state: ChannelList = {
    priority: [chan({ channelId: "dm-pinned", type: "dm", members: [user("me"), user("peer")] })],
    recent: [
      chan({ channelId: "dm-peer", type: "dm", members: [user("me"), user("peer")] }),
      chan({ channelId: "dm-other", type: "dm", members: [user("me"), user("other")] }),
      // A group containing the peer: last-seen is a 1:1 readout, and the route
      // rejects non-DMs, so this must never be invalidated.
      chan({ channelId: "grp", type: "group", members: [user("me"), user("peer")] }),
    ],
  };

  it("returns every DM with that member, across priority and recent", () => {
    expect(dmChannelIdsWithMember(state, "peer").sort()).toEqual(["dm-peer", "dm-pinned"]);
  });

  it("excludes groups the member belongs to", () => {
    expect(dmChannelIdsWithMember(state, "peer")).not.toContain("grp");
  });

  it("excludes DMs the member is not in", () => {
    expect(dmChannelIdsWithMember(state, "peer")).not.toContain("dm-other");
  });

  it("returns nothing for a user who shares no DM", () => {
    expect(dmChannelIdsWithMember(state, "stranger")).toEqual([]);
  });

  it("never repeats a channel id", () => {
    const dup: ChannelList = {
      priority: [chan({ channelId: "dm-1", type: "dm", members: [user("peer"), user("peer")] })],
      recent: [],
    };
    expect(dmChannelIdsWithMember(dup, "peer")).toEqual(["dm-1"]);
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

describe("applyChannelUpdated (QC_008)", () => {
  const state: ChannelList = {
    priority: [chan({ channelId: "c1", name: "old", description: null, avatarUrl: null })],
    recent: [chan({ channelId: "c2", name: "other" })],
  };

  it("merges only the provided fields into the matching channel", () => {
    const next = applyChannelUpdated(state, {
      channelId: "c1",
      name: "new",
      avatarUrl: "https://signed/av.png",
    });
    expect(next.priority[0]!.name).toBe("new");
    expect(next.priority[0]!.avatarUrl).toBe("https://signed/av.png");
    // Untouched fields + other channels unchanged.
    expect(next.priority[0]!.description).toBeNull();
    expect(next.recent[0]!.name).toBe("other");
  });

  it("can clear the description (null) without touching name/avatar", () => {
    const seeded: ChannelList = {
      priority: [chan({ channelId: "c1", name: "keep", description: "was here" })],
      recent: [],
    };
    const next = applyChannelUpdated(seeded, { channelId: "c1", description: null });
    expect(next.priority[0]!.description).toBeNull();
    expect(next.priority[0]!.name).toBe("keep");
  });

  /**
   * `publishRosterChanged` (channels.service) reuses `channel_updated` to signal
   * a MEMBERSHIP change — someone left, was removed, or had their role changed —
   * with a payload of nothing but `{ channelId }`. That is only safe because the
   * merge below is field-guarded: the event's job there is to trigger the
   * `["members"]` / `["channels"]` refetch in `onChannelUpdated`, not to carry
   * new channel details.
   *
   * If this ever becomes an unconditional assign, every roster change would
   * blank the channel's name, description and avatar in the sidebar.
   */
  it("leaves the channel untouched when the payload carries only a channelId", () => {
    const seeded: ChannelList = {
      priority: [
        chan({ channelId: "c1", name: "Design", description: "the good stuff", avatarUrl: "a.png" }),
      ],
      recent: [],
    };
    const next = applyChannelUpdated(seeded, { channelId: "c1" });
    expect(next.priority[0]).toEqual(seeded.priority[0]);
  });
});

describe("removeChannelFromList (QC_008)", () => {
  it("drops a deleted channel from both lists", () => {
    const state: ChannelList = {
      priority: [chan({ channelId: "c1" })],
      recent: [chan({ channelId: "c2" }), chan({ channelId: "c3" })],
    };
    const next = removeChannelFromList(state, "c2");
    expect(next.priority.map((c) => c.channelId)).toEqual(["c1"]);
    expect(next.recent.map((c) => c.channelId)).toEqual(["c3"]);
  });

  it("is a no-op when the channel is absent", () => {
    const state: ChannelList = { priority: [], recent: [chan({ channelId: "c1" })] };
    const next = removeChannelFromList(state, "zzz");
    expect(next.recent.map((c) => c.channelId)).toEqual(["c1"]);
  });
});

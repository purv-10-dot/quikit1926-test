import type { NotificationDto } from "@/lib/shared";
import { describe, expect, it } from "vitest";
import {
  appendPage,
  applyInbound,
  clearAllLocal,
  emptyNotifState,
  markAllReadLocal,
  markChannelReadLocal,
  markReadLocal,
  reconcileCount,
  seed,
  type NotifState,
} from "./notif-store";

let counter = 0;
function n(over: Partial<NotificationDto> = {}): NotificationDto {
  counter += 1;
  return {
    id: over.id ?? `n${counter}`,
    type: "mention",
    actorId: "a1",
    channelId: "c1",
    messageId: "m1",
    preview: "hello",
    meta: {},
    isRead: false,
    createdAt: new Date(2026, 0, 1, 0, 0, counter).toISOString(),
    ...over,
  };
}

describe("applyInbound", () => {
  it("prepends and bumps the badge for an unread notification", () => {
    const s = applyInbound(emptyNotifState(), n({ id: "a", channelId: "c1" }));
    expect(s.feed.map((f) => f.id)).toEqual(["a"]);
    expect(s.unreadCount).toBe(1);
    expect(s.byChannel.c1).toBe(1);
  });

  it("de-dupes by id (no double count)", () => {
    let s = applyInbound(emptyNotifState(), n({ id: "a" }));
    s = applyInbound(s, n({ id: "a" }));
    expect(s.feed).toHaveLength(1);
    expect(s.unreadCount).toBe(1);
  });

  it("does not bump the badge for an already-read (muted) notification", () => {
    const s = applyInbound(emptyNotifState(), n({ id: "a", isRead: true }));
    expect(s.feed).toHaveLength(1);
    expect(s.unreadCount).toBe(0);
    expect(s.byChannel).toEqual({});
  });

  it("newest goes first", () => {
    let s = applyInbound(emptyNotifState(), n({ id: "old" }));
    s = applyInbound(s, n({ id: "new" }));
    expect(s.feed.map((f) => f.id)).toEqual(["new", "old"]);
  });
});

describe("markReadLocal", () => {
  it("clears only the named unread rows and adjusts counts", () => {
    let s = emptyNotifState();
    s = applyInbound(s, n({ id: "a", channelId: "c1" }));
    s = applyInbound(s, n({ id: "b", channelId: "c1" }));
    s = applyInbound(s, n({ id: "c", channelId: "c2" }));
    expect(s.unreadCount).toBe(3);

    s = markReadLocal(s, ["a", "c"]);
    expect(s.unreadCount).toBe(1);
    expect(s.byChannel.c1).toBe(1); // b still unread
    expect(s.byChannel.c2).toBeUndefined();
    expect(s.feed.find((f) => f.id === "a")!.isRead).toBe(true);
  });

  it("re-marking a read row is a no-op for the count", () => {
    let s = applyInbound(emptyNotifState(), n({ id: "a" }));
    s = markReadLocal(s, ["a"]);
    s = markReadLocal(s, ["a"]);
    expect(s.unreadCount).toBe(0);
  });
});

describe("markChannelReadLocal", () => {
  it("clears a channel's unread and removes its byChannel entry", () => {
    let s = emptyNotifState();
    s = applyInbound(s, n({ id: "a", channelId: "c1" }));
    s = applyInbound(s, n({ id: "b", channelId: "c1" }));
    s = applyInbound(s, n({ id: "c", channelId: "c2" }));
    s = markChannelReadLocal(s, "c1");
    expect(s.unreadCount).toBe(1);
    expect(s.byChannel.c1).toBeUndefined();
    expect(s.byChannel.c2).toBe(1);
  });
});

describe("markAllReadLocal / clearAllLocal", () => {
  it("markAll zeroes the badge but keeps the feed", () => {
    let s = applyInbound(emptyNotifState(), n({ id: "a" }));
    s = applyInbound(s, n({ id: "b" }));
    s = markAllReadLocal(s);
    expect(s.unreadCount).toBe(0);
    expect(s.byChannel).toEqual({});
    expect(s.feed.every((f) => f.isRead)).toBe(true);
    expect(s.feed).toHaveLength(2);
  });

  it("clearAll empties everything", () => {
    const s = clearAllLocal();
    expect(s).toEqual(emptyNotifState());
  });
});

describe("appendPage", () => {
  it("appends older rows, de-duped, without touching counts", () => {
    let s = seed([n({ id: "a" })], 1, { c1: 1 });
    s = appendPage(s, [n({ id: "a" }), n({ id: "b" })]);
    expect(s.feed.map((f) => f.id)).toEqual(["a", "b"]);
    expect(s.unreadCount).toBe(1);
  });
});

describe("reconcileCount", () => {
  it("overrides the optimistic count with the server value", () => {
    const s: NotifState = seed([], 5, {});
    expect(reconcileCount(s, 2).unreadCount).toBe(2);
    expect(reconcileCount(s, -3).unreadCount).toBe(0); // clamped
    expect(reconcileCount(s, NaN).unreadCount).toBe(5); // ignored
  });
});

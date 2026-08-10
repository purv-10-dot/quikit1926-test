import type { MessageDto } from "@/lib/shared";
import { describe, expect, it } from "vitest";
import { buildMessageRows, findUnreadDivider } from "./grouping";

const T = new Date("2026-05-08T12:00:00.000Z").getTime();
const at = (ms: number) => new Date(T + ms).toISOString();

function mk(over: Partial<MessageDto> & { id: string }): MessageDto {
  return {
    channelId: "c1",
    senderId: "u1",
    actorType: "human",
    type: "Text",
    content: "hi",
    data: null,
    parentMessageId: null,
    parentPreview: null,
    isPinned: false,
    reactions: [],
    mentions: [],
    createdAt: at(0),
    editedAt: null,
    ...over,
  };
}

describe("buildMessageRows", () => {
  it("groups consecutive same-sender messages within the window", () => {
    const rows = buildMessageRows([
      mk({ id: "a", senderId: "u1", createdAt: at(0) }),
      mk({ id: "b", senderId: "u1", createdAt: at(60_000) }),
    ]);
    expect(rows[0]!.showAuthor).toBe(true);
    expect(rows[1]!.showAuthor).toBe(false);
  });

  it("starts a new author block when the sender changes", () => {
    const rows = buildMessageRows([
      mk({ id: "a", senderId: "u1" }),
      mk({ id: "b", senderId: "u2", createdAt: at(1000) }),
    ]);
    expect(rows[1]!.showAuthor).toBe(true);
  });

  it("starts a new block when the gap exceeds the window", () => {
    const rows = buildMessageRows([
      mk({ id: "a", senderId: "u1", createdAt: at(0) }),
      mk({ id: "b", senderId: "u1", createdAt: at(6 * 60_000) }),
    ]);
    expect(rows[1]!.showAuthor).toBe(true);
  });

  it("system rows always break grouping (both sides)", () => {
    const rows = buildMessageRows([
      mk({ id: "a", senderId: "u1", createdAt: at(0) }),
      mk({ id: "s", senderId: "u1", type: "SystemActivity", createdAt: at(1000) }),
      mk({ id: "b", senderId: "u1", createdAt: at(2000) }),
    ]);
    expect(rows[1]!.showAuthor).toBe(true); // the system row
    expect(rows[2]!.showAuthor).toBe(true); // after a system row
  });

  it("inserts a date divider on the first row and across day boundaries", () => {
    const rows = buildMessageRows([
      mk({ id: "a", createdAt: at(0) }),
      mk({ id: "b", createdAt: at(60_000) }),
      mk({ id: "c", createdAt: new Date(T + 24 * 3600_000).toISOString() }),
    ]);
    expect(rows[0]!.showDateDivider).toBe(true);
    expect(rows[1]!.showDateDivider).toBe(false);
    expect(rows[2]!.showDateDivider).toBe(true);
  });

  it("marks the row matching the given unread-divider id", () => {
    const rows = buildMessageRows(
      [mk({ id: "a" }), mk({ id: "b", createdAt: at(1000) }), mk({ id: "c", createdAt: at(2000) })],
      "b",
    );
    expect(rows.map((r) => r.showUnreadDivider)).toEqual([false, true, false]);
  });

  it("marks no row when no unread-divider id is given (the default)", () => {
    const rows = buildMessageRows([mk({ id: "a" }), mk({ id: "b", createdAt: at(1000) })]);
    expect(rows.every((r) => !r.showUnreadDivider)).toBe(true);
  });
});

describe("findUnreadDivider", () => {
  const ME = "u1";
  const OTHER = "u2";

  it("returns null when there's nothing unread", () => {
    const result = findUnreadDivider([mk({ id: "a", senderId: OTHER })], ME, 0);
    expect(result).toBeNull();
  });

  it("returns null for an empty list regardless of count", () => {
    expect(findUnreadDivider([], ME, 3)).toBeNull();
  });

  it("finds the oldest of the N most recent messages from OTHERS, count = unreadCount", () => {
    // 4 messages from OTHER, in order; unreadCount=2 → the boundary is the
    // 2nd-from-last (the OLDEST of the 2 most recent).
    const messages = [
      mk({ id: "a", senderId: OTHER, createdAt: at(0) }),
      mk({ id: "b", senderId: OTHER, createdAt: at(1000) }),
      mk({ id: "c", senderId: OTHER, createdAt: at(2000) }),
      mk({ id: "d", senderId: OTHER, createdAt: at(3000) }),
    ];
    expect(findUnreadDivider(messages, ME, 2)).toEqual({ messageId: "c", count: 2 });
  });

  it("skips the viewer's own messages — they don't count toward unreadCount", () => {
    // Mirrors the server rule (channels.service.ts): unreadCount only counts
    // senderId !== currentUserId. An own message interleaved in the tail must
    // not be mistaken for one of the N unread messages.
    const messages = [
      mk({ id: "a", senderId: OTHER, createdAt: at(0) }),
      mk({ id: "mine", senderId: ME, createdAt: at(1000) }),
      mk({ id: "b", senderId: OTHER, createdAt: at(2000) }),
    ];
    // unreadCount=1 → only "b" (the most recent OTHER message) is unread;
    // "mine" must be skipped when counting, even though it sits between them.
    expect(findUnreadDivider(messages, ME, 1)).toEqual({ messageId: "b", count: 1 });
  });

  it("falls back to the oldest loaded message, with count = unreadCount, when enough are loaded", () => {
    const messages = [mk({ id: "only", senderId: OTHER, createdAt: at(0) })];
    // Degenerate case matching the old behavior when the array IS complete
    // (just short — this row genuinely is the only one).
    expect(findUnreadDivider(messages, ME, 1)).toEqual({ messageId: "only", count: 1 });
  });

  it("REGRESSION: count reflects what was actually found, not the claimed unreadCount, when the array is incomplete", () => {
    // The exact bug: unreadCount says 7 (from the channels list, always
    // accurate), but only 6 non-self messages are loaded (a stale
    // messages-query cache page not yet caught up by its background
    // refetch — see MessageList's comment). Before this fix, the walk fell
    // back to messages[0] but the CALLER still labelled with the raw
    // unreadCount (7) while only 6 messages sat at-or-after that position —
    // label and position disagreed. The fix: `count` must report 6, the
    // true found number, so a caller that renders `count` (not the input
    // unreadCount) can never show a number the position doesn't back up.
    const messages = [
      mk({ id: "1", senderId: OTHER, createdAt: at(0) }),
      mk({ id: "2", senderId: OTHER, createdAt: at(1000) }),
      mk({ id: "3", senderId: OTHER, createdAt: at(2000) }),
      mk({ id: "4", senderId: OTHER, createdAt: at(3000) }),
      mk({ id: "5", senderId: OTHER, createdAt: at(4000) }),
      mk({ id: "6", senderId: OTHER, createdAt: at(5000) }),
    ];
    const result = findUnreadDivider(messages, ME, 7);
    expect(result).toEqual({ messageId: "1", count: 6 });
    // The count must equal how many messages are actually at-or-after the
    // resolved position — i.e. label/position agreement, checked directly.
    const idx = messages.findIndex((m) => m.id === result!.messageId);
    expect(messages.length - idx).toBe(result!.count);
  });

  it("returns null (not a zero-count divider) when none of the claimed unread messages can be found at all", () => {
    const messages = [mk({ id: "mine", senderId: ME, createdAt: at(0) })];
    expect(findUnreadDivider(messages, ME, 3)).toBeNull();
  });
});

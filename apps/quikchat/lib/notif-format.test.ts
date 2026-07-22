import type { NotificationDto } from "@/lib/shared";
import { describe, expect, it } from "vitest";
import {
  channelLabel,
  fullSummary,
  groupFeed,
  groupLabel,
  relativeTime,
  summaryText,
} from "./notif-format";

function n(
  over: Partial<NotificationDto> & { meta?: Record<string, unknown> } = {},
): NotificationDto {
  return {
    id: "n1",
    type: "mention",
    actorId: "a1",
    channelId: "c1",
    messageId: "m1",
    preview: "p",
    meta: { channelName: "design", channelType: "group", actorName: "Maya" },
    isRead: false,
    createdAt: new Date().toISOString(),
    ...over,
  } as NotificationDto;
}

describe("summaryText", () => {
  it("renders per type", () => {
    expect(summaryText(n({ type: "mention" }))).toBe("mentioned you");
    expect(summaryText(n({ type: "dm" }))).toBe("sent you a message");
    expect(summaryText(n({ type: "keyword", meta: { keyword: "deploy" } }))).toBe(
      "keyword “deploy”",
    );
    expect(summaryText(n({ type: "reaction", meta: { emoji: "🎉" } }))).toBe(
      "reacted 🎉 to your message",
    );
    expect(summaryText(n({ type: "thread_reply" }))).toBe("replied in a thread");
  });

  it("falls back gracefully without meta", () => {
    expect(summaryText(n({ type: "keyword", meta: {} }))).toBe("matched a keyword");
    expect(summaryText(n({ type: "reaction", meta: {} }))).toBe("reacted to your message");
  });
});

describe("fullSummary / channelLabel / groupLabel", () => {
  it("prefixes the actor name", () => {
    expect(fullSummary(n({ meta: { actorName: "Maya" } }))).toBe("Maya mentioned you");
    expect(fullSummary(n({ meta: {} }))).toBe("Someone mentioned you");
  });
  it("labels channels and DMs", () => {
    expect(channelLabel(n({ meta: { channelName: "design", channelType: "group" } }))).toBe(
      "#design",
    );
    expect(channelLabel(n({ meta: { channelType: "dm" } }))).toBe("DM");
    expect(groupLabel(n({ meta: { channelName: "Priya", channelType: "dm" } }))).toBe("Priya");
    expect(groupLabel(n({ meta: { channelName: "design", channelType: "group" } }))).toBe(
      "#design",
    );
  });
});

describe("groupFeed", () => {
  it("groups by channel, preserving first-seen order", () => {
    const feed = [
      n({ id: "1", channelId: "c1", meta: { channelName: "design", channelType: "group" } }),
      n({ id: "2", channelId: "c1", meta: { channelName: "design", channelType: "group" } }),
      n({ id: "3", channelId: "dmX", meta: { channelName: "Priya", channelType: "dm" } }),
    ];
    const groups = groupFeed(feed);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.label).toBe("#design");
    expect(groups[0]!.items.map((i) => i.id)).toEqual(["1", "2"]);
    expect(groups[1]!.isDm).toBe(true);
    expect(groups[1]!.label).toBe("Priya");
  });
});

describe("relativeTime", () => {
  const base = Date.parse("2026-06-18T12:00:00.000Z");
  it("renders compact buckets", () => {
    expect(relativeTime(new Date(base).toISOString(), base + 10_000)).toBe("now");
    expect(relativeTime(new Date(base).toISOString(), base + 5 * 60_000)).toBe("5m");
    expect(relativeTime(new Date(base).toISOString(), base + 3 * 3_600_000)).toBe("3h");
    expect(relativeTime(new Date(base).toISOString(), base + 2 * 86_400_000)).toBe("2d");
  });
  it("handles bad input", () => {
    expect(relativeTime("not-a-date")).toBe("");
  });
});

import { describe, expect, it } from "vitest";
import { applyTyping, emptyTyping, pruneTyping, whoIsTyping, TYPING_TTL_MS } from "./typing-store";

const NOW = 1_000_000;

describe("applyTyping", () => {
  it("marks a user typing in a channel until now + ttl", () => {
    const s = applyTyping(emptyTyping(), { channelId: "c1", userId: "u1" }, NOW);
    expect(whoIsTyping(s, "c1", NOW)).toEqual(["u1"]);
    expect(whoIsTyping(s, "c1", NOW + TYPING_TTL_MS + 1)).toEqual([]);
  });

  it("keeps channels independent", () => {
    let s = applyTyping(emptyTyping(), { channelId: "c1", userId: "u1" }, NOW);
    s = applyTyping(s, { channelId: "c2", userId: "u2" }, NOW);
    expect(whoIsTyping(s, "c1", NOW)).toEqual(["u1"]);
    expect(whoIsTyping(s, "c2", NOW)).toEqual(["u2"]);
  });

  it("refreshes the expiry for a repeat event", () => {
    let s = applyTyping(emptyTyping(), { channelId: "c1", userId: "u1" }, NOW);
    s = applyTyping(s, { channelId: "c1", userId: "u1" }, NOW + 4_000);
    // Past the first expiry but within the refreshed one.
    expect(whoIsTyping(s, "c1", NOW + TYPING_TTL_MS + 1)).toEqual(["u1"]);
  });

  it("ignores malformed events", () => {
    const s = emptyTyping();
    expect(applyTyping(s, { channelId: "", userId: "u1" }, NOW)).toBe(s);
    expect(applyTyping(s, { channelId: "c1", userId: "" }, NOW)).toBe(s);
  });
});

describe("pruneTyping", () => {
  it("drops expired entries and empties channels", () => {
    let s = applyTyping(emptyTyping(), { channelId: "c1", userId: "u1" }, NOW);
    s = applyTyping(s, { channelId: "c1", userId: "u2" }, NOW + 2_000);
    const pruned = pruneTyping(s, NOW + TYPING_TTL_MS + 1); // u1 expired, u2 alive
    expect(whoIsTyping(pruned, "c1", NOW + TYPING_TTL_MS + 1)).toEqual(["u2"]);

    const allGone = pruneTyping(pruned, NOW + 2_000 + TYPING_TTL_MS + 1);
    expect(allGone.c1).toBeUndefined();
  });

  it("returns the same reference when nothing is expired", () => {
    const s = applyTyping(emptyTyping(), { channelId: "c1", userId: "u1" }, NOW);
    expect(pruneTyping(s, NOW + 1_000)).toBe(s);
  });
});

describe("whoIsTyping", () => {
  it("returns an empty list for an unknown channel", () => {
    expect(whoIsTyping(emptyTyping(), "nope", NOW)).toEqual([]);
  });
});

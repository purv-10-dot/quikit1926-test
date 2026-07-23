import type { Mention } from "@/lib/shared";
import { describe, expect, it } from "vitest";
import { computeMentions, findMentionQuery, segmentContent } from "./mentions";

describe("segmentContent", () => {
  it("splits text around a valid mention", () => {
    const mentions: Mention[] = [
      { userId: "u2", displayName: "Bob", offsetStart: 3, offsetEnd: 7 },
    ];
    const segs = segmentContent("hi @Bob!", mentions);
    expect(segs).toEqual([
      { type: "text", value: "hi " },
      { type: "mention", value: "@Bob", userId: "u2" },
      { type: "text", value: "!" },
    ]);
  });
  it("ignores out-of-bounds / non-@ mentions", () => {
    const segs = segmentContent("hello", [
      { userId: "x", displayName: "X", offsetStart: 0, offsetEnd: 99 },
    ]);
    expect(segs).toEqual([{ type: "text", value: "hello" }]);
  });
});

describe("findMentionQuery", () => {
  it("detects the active @token under the caret", () => {
    expect(findMentionQuery("hi @al", 6)).toEqual({ start: 3, query: "al" });
  });
  it("returns null when not in a mention token", () => {
    expect(findMentionQuery("hi there", 8)).toBeNull();
    expect(findMentionQuery("a@b.com", 7)).toBeNull(); // @ not preceded by space
  });
});

describe("computeMentions", () => {
  const members = [
    { id: "u-alice", displayName: "Alice" },
    { id: "u-ab", displayName: "Alice B" },
  ];
  it("produces correct offsets, longest-name-first", () => {
    const text = "yo @Alice B and @Alice";
    const result = computeMentions(text, members);
    expect(result).toEqual([
      { userId: "u-ab", offsetStart: 3, offsetEnd: 11 },
      { userId: "u-alice", offsetStart: 16, offsetEnd: 22 },
    ]);
  });
  it("honours @everyone literal and dedupes per user", () => {
    const text = "@everyone @everyone @Alice @Alice";
    const result = computeMentions(text, members);
    expect(result.filter((m) => m.userId === "everyone")).toHaveLength(1);
    expect(result.filter((m) => m.userId === "u-alice")).toHaveLength(1);
  });
  it("does not match @ inside an email", () => {
    expect(computeMentions("ping a@Alice.com", members)).toEqual([]);
  });
});

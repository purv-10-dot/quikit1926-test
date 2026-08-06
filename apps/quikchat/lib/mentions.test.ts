import type { Mention } from "@/lib/shared";
import { describe, expect, it } from "vitest";
import {
  computeMentions,
  findMentionQuery,
  mentionableMembers,
  segmentContent,
} from "./mentions";

describe("mentionableMembers (QC_015 — cannot mention yourself)", () => {
  const members = [
    { id: "u-me", displayName: "Alice" },
    { id: "u-bob", displayName: "Bob" },
    { id: "u-cara", displayName: "Cara" },
  ];

  it("excludes the current user, keeps everyone else", () => {
    expect(mentionableMembers(members, "u-me")).toEqual([
      { id: "u-bob", displayName: "Bob" },
      { id: "u-cara", displayName: "Cara" },
    ]);
  });

  it("returns the list unchanged when currentUserId is undefined", () => {
    expect(mentionableMembers(members, undefined)).toEqual(members);
  });

  it("is empty-safe and non-mutating", () => {
    const input = [...members];
    expect(mentionableMembers([], "u-me")).toEqual([]);
    mentionableMembers(input, "u-bob");
    expect(input).toEqual(members); // original untouched
  });

  it("filtered members produce no self-mention in computeMentions", () => {
    // Typing your own name against the filtered candidate list yields no ref.
    const filtered = mentionableMembers(members, "u-me");
    expect(computeMentions("hey @Alice", filtered)).toEqual([]);
    expect(computeMentions("hey @Bob", filtered)).toEqual([
      { userId: "u-bob", offsetStart: 4, offsetEnd: 8 },
    ]);
  });
});

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

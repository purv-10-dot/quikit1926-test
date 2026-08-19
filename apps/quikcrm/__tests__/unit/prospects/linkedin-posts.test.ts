/**
 * lib/services/prospects/linkedin-posts — parsing the scraped posts blob.
 *
 * `CrmProspect.posts` is written verbatim from the Chrome extension and is
 * never validated on write (the API stores it as an opaque Json blob). So the
 * parser is the only thing standing between a malformed scrape and a broken
 * prospects page — these tests pin that contract.
 *
 * Pure functions, no DB — no mocks needed.
 */
import { describe, expect, it } from "vitest";
import {
  parseLinkedInPosts,
  summarizeLinkedInPosts,
} from "@/lib/services/prospects/linkedin-posts";

/** A well-formed post exactly as the extension emits it. */
const goodPost = {
  text: "We just shipped our Q3 release.",
  type: "shared",
  date: "2026-07-01T10:00:00.000Z",
  relativeTime: "1mo",
  hasImage: true,
  imageUrl: "https://media.licdn.com/dms/image/abc.jpg",
  imageAlt: "Release banner",
  engagement: { reactions: 42, comments: 7 },
};

describe("parseLinkedInPosts — non-array input", () => {
  // The column is nullable and the blob is untyped; all of these are reachable.
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["an object", { text: "not an array" }],
    ["a string", "posts"],
    ["a number", 5],
  ])("returns [] for %s", (_label, input) => {
    expect(parseLinkedInPosts(input)).toEqual([]);
  });
});

describe("parseLinkedInPosts — normalization", () => {
  it("maps a well-formed post onto the flat render shape", () => {
    const [post] = parseLinkedInPosts([goodPost]);
    expect(post).toEqual({
      text: "We just shipped our Q3 release.",
      type: "shared",
      date: "2026-07-01T10:00:00.000Z",
      relativeTime: "1mo",
      imageUrl: "https://media.licdn.com/dms/image/abc.jpg",
      imageAlt: "Release banner",
      // engagement is flattened out of the nested object
      reactions: 42,
      comments: 7,
    });
  });

  it("drops entries with no usable text", () => {
    const posts = parseLinkedInPosts([
      { ...goodPost, text: "" },
      { ...goodPost, text: "   " },
      { ...goodPost, text: undefined },
      null,
      "string entry",
      goodPost,
    ]);
    expect(posts).toHaveLength(1);
    expect(posts[0].text).toBe("We just shipped our Q3 release.");
  });

  it("defaults engagement to 0 when missing or malformed", () => {
    const posts = parseLinkedInPosts([
      { text: "a" },
      { text: "b", engagement: {} },
      { text: "c", engagement: { reactions: "12", comments: null } },
      { text: "d", engagement: { reactions: -5, comments: Number.NaN } },
      { text: "e", engagement: { reactions: 3.7, comments: 2 } },
    ]);
    expect(posts.map((p) => [p.reactions, p.comments])).toEqual([
      [0, 0],
      [0, 0],
      [12, 0], // numeric string coerced
      [0, 0], // negative and NaN floored to 0
      [3, 2], // fractional truncated
    ]);
  });

  it("keeps only http(s) image URLs", () => {
    const posts = parseLinkedInPosts([
      { text: "a", imageUrl: "https://media.licdn.com/x.jpg" },
      { text: "b", imageUrl: "http://media.licdn.com/y.jpg" },
      // A data: placeholder the scraper can pick up — must not be rendered.
      { text: "c", imageUrl: "data:image/gif;base64,R0lGOD" },
      { text: "d", imageUrl: "javascript:alert(1)" },
      { text: "e", imageUrl: "" },
    ]);
    expect(posts.map((p) => p.imageUrl)).toEqual([
      "https://media.licdn.com/x.jpg",
      "http://media.licdn.com/y.jpg",
      null,
      null,
      null,
    ]);
  });

  it("nulls out unparseable dates rather than passing them through", () => {
    const posts = parseLinkedInPosts([
      { text: "a", date: "not-a-date" },
      { text: "b", date: "" },
      { text: "c", date: "2026-07-01T10:00:00.000Z" },
    ]);
    expect(posts.map((p) => p.date)).toEqual([
      "2026-07-01T10:00:00.000Z", // dated entry sorts first
      null,
      null,
    ]);
  });
});

describe("parseLinkedInPosts — ordering", () => {
  it("sorts dated posts newest first", () => {
    const posts = parseLinkedInPosts([
      { text: "oldest", date: "2026-01-01T00:00:00.000Z" },
      { text: "newest", date: "2026-08-01T00:00:00.000Z" },
      { text: "middle", date: "2026-05-01T00:00:00.000Z" },
    ]);
    expect(posts.map((p) => p.text)).toEqual(["newest", "middle", "oldest"]);
  });

  it("places undated posts after dated ones, preserving scrape order", () => {
    const posts = parseLinkedInPosts([
      { text: "undated-1" },
      { text: "dated", date: "2026-05-01T00:00:00.000Z" },
      { text: "undated-2" },
    ]);
    expect(posts.map((p) => p.text)).toEqual(["dated", "undated-1", "undated-2"]);
  });
});

describe("summarizeLinkedInPosts", () => {
  it("totals count, reactions and comments", () => {
    const posts = parseLinkedInPosts([
      { text: "a", engagement: { reactions: 10, comments: 2 } },
      { text: "b", engagement: { reactions: 5, comments: 3 } },
    ]);
    expect(summarizeLinkedInPosts(posts)).toEqual({
      count: 2,
      totalReactions: 15,
      totalComments: 5,
    });
  });

  it("returns zeroes for an empty list", () => {
    expect(summarizeLinkedInPosts([])).toEqual({
      count: 0,
      totalReactions: 0,
      totalComments: 0,
    });
  });
});

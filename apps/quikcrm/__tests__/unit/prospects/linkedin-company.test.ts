/**
 * parseLinkedInCompany — normalizes the extension's untrusted `companyData`
 * blob before it reaches the Prospects UI.
 *
 * The blob is extension-owned JSON written across several scraper versions, so
 * the parser must never throw and must never pass through an unsafe URL.
 */
import { describe, expect, it } from "vitest";
import { parseLinkedInCompany } from "@/lib/services/prospects/linkedin-company";

const FULL = {
  name: "Quikit",
  tagline: "One Business. One Subscription.",
  about: "Businesses struggle because they have too much software.",
  industry: "Software Development",
  website: "http://www.quikit.ai",
  companySize: "11-50 employees",
  headquarters: "Indore, Madhya Pradesh, IN",
  founded: "2023",
  specialties: "CRM, PMS, HRMS",
  followers: "568",
  employees: "32",
  logo: "https://media.licdn.com/logo.jpg",
  banner: "https://media.licdn.com/banner.jpg",
  companyUrl: "https://www.linkedin.com/company/quikit/",
  posts: [
    {
      text: "A company post about interconnected apps.",
      date: "2026-07-01T10:00:00.000Z",
      reactions: 12,
      comments: 3,
      images: ["https://media.licdn.com/p1.jpg"],
      videos: [],
      postUrl: "https://www.linkedin.com/feed/update/urn:li:activity:9001/",
    },
  ],
  __source: "voyager",
};

describe("parseLinkedInCompany", () => {
  it("maps every field from a full blob", () => {
    const c = parseLinkedInCompany(FULL);
    expect(c).not.toBeNull();
    expect(c).toMatchObject({
      name: "Quikit",
      tagline: "One Business. One Subscription.",
      industry: "Software Development",
      website: "http://www.quikit.ai",
      companySize: "11-50 employees",
      headquarters: "Indore, Madhya Pradesh, IN",
      founded: "2023",
      specialties: "CRM, PMS, HRMS",
      followers: "568",
      employees: "32",
      source: "voyager",
    });
    expect(c!.posts).toHaveLength(1);
    expect(c!.posts[0]).toMatchObject({ reactions: 12, comments: 3 });
  });

  it("returns null for anything that is not a usable object", () => {
    for (const bad of [null, undefined, "str", 42, [], [1, 2], true]) {
      expect(parseLinkedInCompany(bad)).toBeNull();
    }
  });

  it("returns null when the blob has no meaningful content", () => {
    expect(parseLinkedInCompany({ __source: "none", posts: [] })).toBeNull();
    expect(parseLinkedInCompany({ logo: "https://x/y.jpg" })).toBeNull();
  });

  it("falls back to the legacy `location` alias for headquarters", () => {
    const c = parseLinkedInCompany({ name: "Acme", location: "Redmond, Washington" });
    expect(c!.headquarters).toBe("Redmond, Washington");
  });

  it("prefers `headquarters` over `location` when both exist", () => {
    const c = parseLinkedInCompany({ name: "Acme", headquarters: "Indore", location: "Old" });
    expect(c!.headquarters).toBe("Indore");
  });

  it("rejects unsafe URLs", () => {
    const c = parseLinkedInCompany({
      name: "Evil",
      logo: "javascript:alert(1)",
      banner: "data:text/html;base64,PHNjcmlwdD4=",
      companyUrl: "ftp://example.com/x",
    });
    expect(c!.logo).toBe("");
    expect(c!.banner).toBe("");
    expect(c!.companyUrl).toBe("");
  });

  it("drops unsafe post URLs and media but keeps the post text", () => {
    const c = parseLinkedInCompany({
      name: "Acme",
      posts: [{
        text: "still readable",
        images: ["javascript:alert(1)", "https://ok/i.jpg"],
        videos: ["data:x"],
        postUrl: "javascript:alert(2)",
      }],
    });
    expect(c!.posts).toHaveLength(1);
    expect(c!.posts[0].images).toEqual(["https://ok/i.jpg"]);
    expect(c!.posts[0].videos).toEqual([]);
    expect(c!.posts[0].postUrl).toBe("");
    expect(c!.posts[0].text).toBe("still readable");
  });

  it("skips posts with neither text nor media", () => {
    const c = parseLinkedInCompany({
      name: "Acme",
      industry: "Tech",
      posts: [{ text: "", images: [], videos: [] }, { text: "real" }],
    });
    expect(c!.posts).toHaveLength(1);
    expect(c!.posts[0].text).toBe("real");
  });

  it("caps posts at 20", () => {
    const posts = Array.from({ length: 40 }, (_, i) => ({ text: `post ${i}` }));
    const c = parseLinkedInCompany({ name: "Acme", posts });
    expect(c!.posts).toHaveLength(20);
  });

  it("coerces numeric and malformed engagement counts", () => {
    const c = parseLinkedInCompany({
      name: "Acme",
      posts: [{ text: "x", reactions: "1,234", comments: "nope" }],
    });
    expect(c!.posts[0].reactions).toBe(1234);
    expect(c!.posts[0].comments).toBe(0);
  });

  it("tolerates a non-array posts value", () => {
    const c = parseLinkedInCompany({ name: "Acme", industry: "Tech", posts: "oops" });
    expect(c!.posts).toEqual([]);
  });

  it("accepts a numeric founded/employees value", () => {
    const c = parseLinkedInCompany({ name: "Acme", founded: 1975, employees: 250 });
    expect(c!.founded).toBe("1975");
    expect(c!.employees).toBe("250");
  });

  it("never throws on deeply malformed input", () => {
    const nasty = { name: "Acme", posts: [null, 1, "x", { text: {} }, []] };
    expect(() => parseLinkedInCompany(nasty)).not.toThrow();
  });
});

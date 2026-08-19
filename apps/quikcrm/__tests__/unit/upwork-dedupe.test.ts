/**
 * Unit tests for the Upwork dedupe primitives.
 *
 * These three pure functions are what stop the same job being captured twice,
 * so they are tested apart from the route: URL normalisation is where the real
 * edge cases live (tracking params, trailing slash, host case, unparseable
 * input), and getting it wrong silently produces duplicate CRM records.
 */
import { describe, expect, it } from "vitest";
import {
  buildDedupeKey,
  extractUpworkJobId,
  normalizeJobUrl,
} from "@/lib/services/upwork/upwork-service";

const BASE = "https://www.upwork.com/jobs/Data-Entry_~0123456789abcdef";

describe("normalizeJobUrl", () => {
  it("strips the query string", () => {
    expect(normalizeJobUrl(`${BASE}?source=search`)).toBe(BASE);
  });

  it("strips the fragment", () => {
    expect(normalizeJobUrl(`${BASE}#details`)).toBe(BASE);
  });

  it("strips a trailing slash", () => {
    expect(normalizeJobUrl(`${BASE}/`)).toBe(BASE);
  });

  it("lower-cases the host but preserves path case", () => {
    // Upwork job slugs are case-significant; the host is not.
    expect(normalizeJobUrl("https://WWW.UPWORK.COM/jobs/Data-Entry_~01")).toBe(
      "https://www.upwork.com/jobs/Data-Entry_~01",
    );
  });

  it("collapses every variant of the same job to one value", () => {
    const variants = [
      BASE,
      `${BASE}/`,
      `${BASE}?source=search&referrer_url_path=%2Fnx`,
      `${BASE}/?source=search#tab`,
    ];
    expect(new Set(variants.map((v) => normalizeJobUrl(v))).size).toBe(1);
  });

  it("returns null for empty or unparseable input", () => {
    expect(normalizeJobUrl(null)).toBeNull();
    expect(normalizeJobUrl(undefined)).toBeNull();
    expect(normalizeJobUrl("")).toBeNull();
    expect(normalizeJobUrl("not a url")).toBeNull();
  });
});

describe("extractUpworkJobId", () => {
  it("pulls the ~0… ticket id out of a job URL", () => {
    expect(extractUpworkJobId(BASE)).toBe("~0123456789abcdef");
  });

  it("returns null when there is no ticket id", () => {
    expect(extractUpworkJobId("https://www.upwork.com/nx/find-work/")).toBeNull();
    expect(extractUpworkJobId(null)).toBeNull();
  });
});

describe("buildDedupeKey", () => {
  it("prefers the normalised URL", () => {
    expect(buildDedupeKey({ jobUrl: `${BASE}?x=1`, jobTitle: "Anything" })).toBe(
      `url:${BASE}`,
    );
  });

  it("gives the same key for the same job regardless of scraped title drift", () => {
    const a = buildDedupeKey({ jobUrl: BASE, jobTitle: "Data Entry" });
    const b = buildDedupeKey({ jobUrl: `${BASE}/`, jobTitle: "Data Entry Specialist" });
    expect(a).toBe(b);
  });

  it("falls back to a content hash when there is no URL", () => {
    const key = buildDedupeKey({ jobTitle: "Data Entry", jobDescription: "Desc" });
    expect(key).toMatch(/^hash:[0-9a-f]{64}$/u);
  });

  it("hashes title AND description, so same-title different-job does not collide", () => {
    // "Data Entry Specialist Needed" is posted daily by different clients —
    // title alone would merge unrelated postings into one record.
    const a = buildDedupeKey({ jobTitle: "Data Entry", jobDescription: "Client A brief" });
    const b = buildDedupeKey({ jobTitle: "Data Entry", jobDescription: "Client B brief" });
    expect(a).not.toBe(b);
  });

  it("is stable across whitespace-only differences", () => {
    const a = buildDedupeKey({ jobTitle: "Data Entry", jobDescription: "Desc" });
    const b = buildDedupeKey({ jobTitle: "  Data Entry  ", jobDescription: "  Desc  " });
    expect(a).toBe(b);
  });
});

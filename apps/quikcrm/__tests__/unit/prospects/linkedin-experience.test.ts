import { describe, it, expect } from "vitest";
import {
  parseLinkedInExperiences,
  experienceRange,
} from "@/lib/services/prospects/linkedin-experience";

/**
 * `CrmProspect.experiences` is untrusted, extension-owned JSON written by
 * several scraper versions, so these tests focus on the two things that matter:
 * a malformed blob can never break the Prospects UI, and a hostile blob can
 * never put a dangerous URL into an anchor.
 */
describe("parseLinkedInExperiences", () => {
  it("returns [] for anything that is not an array", () => {
    expect(parseLinkedInExperiences(null)).toEqual([]);
    expect(parseLinkedInExperiences(undefined)).toEqual([]);
    expect(parseLinkedInExperiences({})).toEqual([]);
    expect(parseLinkedInExperiences("nope")).toEqual([]);
    expect(parseLinkedInExperiences(42)).toEqual([]);
  });

  it("parses a full position with every field populated", () => {
    const out = parseLinkedInExperiences([
      {
        jobTitle: "Senior Software Engineer",
        companyName: "Microsoft",
        companyUrl: "https://www.linkedin.com/company/microsoft/",
        duration: "Jan 2022 - Present · 2 yrs 3 mos",
        location: "Redmond, Washington",
        description: "Led Azure Front Door reliability.",
        current: true,
      },
    ]);

    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      jobTitle: "Senior Software Engineer",
      companyName: "Microsoft",
      companyUrl: "https://www.linkedin.com/company/microsoft/",
      duration: "Jan 2022 - Present · 2 yrs 3 mos",
      startDate: "",
      endDate: "",
      location: "Redmond, Washington",
      description: "Led Azure Front Door reliability.",
      current: true,
    });
  });

  it("preserves multi-line bullet descriptions verbatim", () => {
    const description = "Grew the team 4 → 11.\nShipped pipeline v3.\nCut p99 38%.";
    const out = parseLinkedInExperiences([
      { jobTitle: "EM", companyName: "Netflix", description },
    ]);
    expect(out[0]?.description).toBe(description);
  });

  it("drops rows with neither a title nor a company", () => {
    const out = parseLinkedInExperiences([
      { jobTitle: "", companyName: "", location: "Remote" },
      { jobTitle: "Real Role", companyName: "" },
      { companyName: "Real Co" },
    ]);
    expect(out.map((e) => e.jobTitle)).toEqual(["Real Role", ""]);
    expect(out).toHaveLength(2);
  });

  it("tolerates malformed rows without throwing", () => {
    const out = parseLinkedInExperiences([
      null,
      42,
      "string",
      [],
      {},
      { jobTitle: "Survivor", companyName: "Acme" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.jobTitle).toBe("Survivor");
  });

  it("accepts the legacy `title` / `company` field aliases", () => {
    const out = parseLinkedInExperiences([{ title: "Analyst", company: "Beta" }]);
    expect(out[0]?.jobTitle).toBe("Analyst");
    expect(out[0]?.companyName).toBe("Beta");
  });

  it("rejects non-http(s) company URLs", () => {
    const out = parseLinkedInExperiences([
      { jobTitle: "A", companyName: "X", companyUrl: "javascript:alert(1)" },
      { jobTitle: "B", companyName: "Y", companyUrl: "data:text/html,<script>" },
      { jobTitle: "C", companyName: "Z", companyUrl: "https://ok.example.com/" },
    ]);
    expect(out[0]?.companyUrl).toBe("");
    expect(out[1]?.companyUrl).toBe("");
    expect(out[2]?.companyUrl).toBe("https://ok.example.com/");
  });

  it("coerces `current` to a strict boolean", () => {
    const out = parseLinkedInExperiences([
      { jobTitle: "A", companyName: "X", current: "yes" },
      { jobTitle: "B", companyName: "Y", current: true },
      { jobTitle: "C", companyName: "Z" },
    ]);
    expect(out.map((e) => e.current)).toEqual([false, true, false]);
  });

  it("trims whitespace and coerces numeric values to strings", () => {
    const out = parseLinkedInExperiences([
      { jobTitle: "  Padded  ", companyName: "  Co  ", duration: 2022 },
    ]);
    expect(out[0]?.jobTitle).toBe("Padded");
    expect(out[0]?.companyName).toBe("Co");
    expect(out[0]?.duration).toBe("2022");
  });

  it("caps the list at 50 positions", () => {
    const many = Array.from({ length: 80 }, (_, i) => ({
      jobTitle: `Role ${i}`,
      companyName: "Co",
    }));
    expect(parseLinkedInExperiences(many)).toHaveLength(50);
  });
});

describe("experienceRange", () => {
  const base = {
    jobTitle: "X",
    companyName: "Y",
    companyUrl: "",
    duration: "",
    startDate: "",
    endDate: "",
    location: "",
    description: "",
    current: false,
  };

  it("prefers LinkedIn's own duration string", () => {
    expect(experienceRange({ ...base, duration: "2 yrs 3 mos", startDate: "1/2020" })).toBe(
      "2 yrs 3 mos",
    );
  });

  it("composes start – end when duration is absent", () => {
    expect(experienceRange({ ...base, startDate: "5/2023", endDate: "8/2023" })).toBe(
      "5/2023 – 8/2023",
    );
  });

  it("uses Present for a current role with no end date", () => {
    expect(experienceRange({ ...base, startDate: "5/2023", current: true })).toBe(
      "5/2023 – Present",
    );
  });

  it("returns an empty string when there are no dates at all", () => {
    expect(experienceRange(base)).toBe("");
  });
});

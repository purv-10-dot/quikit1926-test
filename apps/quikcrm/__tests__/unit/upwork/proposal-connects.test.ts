/**
 * Upwork submitted-proposal capture — Connects charged for the proposal.
 *
 * `connectsUsed` is the proposal's SUBMISSION cost, taken from Upwork's labelled
 * "Required Connects to submit a proposal: N". This is a deliberate product
 * decision: Upwork exposes no historical "actual spend" figure, so the
 * submission amount is the agreed Sales Cost proxy.
 *
 * Two other Connects numbers appear in the same product and must never be used:
 *
 *   account balance  — "Available Connects: 107" (the wallet, not a proposal)
 *   proposals        — the listing's proposal-count range ("20 to 50")
 *
 * And one field must never be disturbed:
 *
 *   CrmUpworkJob.requiredConnects — the job LISTING's value, written only by the
 *   job scraper. Proposal capture keeps its own columns.
 *
 * The validator must also keep "not shown by Upwork" (null) distinguishable from
 * "zero were spent" (0), because a 0 would read as a real figure in the future
 * Sales Cost calculation.
 */
import { describe, expect, it } from "vitest";
import {
  createUpworkJobSchema,
  upworkProposalSchema,
} from "@/lib/validators/upwork";

describe("upworkProposalSchema", () => {
  it("accepts a fully populated proposal", () => {
    const r = upworkProposalSchema.safeParse({
      proposalId: "1234567890",
      proposalSubmittedAt: "2026-08-01T10:00:00.000Z",
      connectsUsed: 22,
      boostConnects: 10,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.connectsUsed).toBe(22);
      expect(r.data.boostConnects).toBe(10);
    }
  });

  it("requires a proposalId — it is the stable identity for re-extraction", () => {
    expect(upworkProposalSchema.safeParse({ connectsUsed: 22 }).success).toBe(false);
    expect(
      upworkProposalSchema.safeParse({ proposalId: "  ", connectsUsed: 22 }).success,
    ).toBe(false);
  });

  it("accepts a proposal with NO connects value — null, never guessed", () => {
    // Upwork does not always state actual spend. Null must be a valid, storable
    // outcome so the extension never has to invent a number.
    const r = upworkProposalSchema.safeParse({
      proposalId: "p1",
      connectsUsed: null,
      boostConnects: null,
    });
    expect(r.success).toBe(true);
  });

  it("keeps 0 distinct from null", () => {
    const zero = upworkProposalSchema.safeParse({ proposalId: "p1", connectsUsed: 0 });
    expect(zero.success).toBe(true);
    if (zero.success) {
      expect(zero.data.connectsUsed).toBe(0);
      expect(zero.data.connectsUsed).not.toBeNull();
    }
  });

  it("rejects a non-integer or negative connects count", () => {
    // Connects are whole units; a fractional or negative value is a scrape bug,
    // and silently coercing it would store a wrong quantity.
    expect(
      upworkProposalSchema.safeParse({ proposalId: "p1", connectsUsed: 2.5 }).success,
    ).toBe(false);
    expect(
      upworkProposalSchema.safeParse({ proposalId: "p1", connectsUsed: -1 }).success,
    ).toBe(false);
  });

  it("rejects a connects value passed as a string", () => {
    expect(
      upworkProposalSchema.safeParse({ proposalId: "p1", connectsUsed: "22" }).success,
    ).toBe(false);
  });

  it("rejects a non-ISO submitted date rather than coercing it", () => {
    expect(
      upworkProposalSchema.safeParse({ proposalId: "p1", proposalSubmittedAt: "2 days ago" })
        .success,
    ).toBe(false);
  });
});

describe("proposal capture does not disturb the job-listing fields", () => {
  it("keeps requiredConnects / proposals out of the proposal payload", () => {
    // Regression guard for the central confusion this feature must avoid: the
    // proposal schema has no field that could overwrite either listing value.
    const keys = Object.keys(upworkProposalSchema.shape);
    expect(keys).not.toContain("requiredConnects");
    expect(keys).not.toContain("proposals");
    expect(keys.sort()).toEqual(
      [
        "boostConnects",
        "connectsUsed",
        "proposalCoverLetter",
        "proposalId",
        "proposalSubmittedAt",
      ].sort(),
    );
  });

  it("leaves the job-capture contract unchanged", () => {
    // The existing "Add to CRM" payload must still validate exactly as before —
    // proposal capture is a separate call and adds nothing to this schema.
    const r = createUpworkJobSchema.safeParse({
      jobTitle: "Microsoft Partner Program Expert Needed",
      jobUrl: "https://www.upwork.com/jobs/~021234567890123456789",
      requiredConnects: "16",
      proposals: "20 to 50",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.requiredConnects).toBe("16");
      expect(r.data.proposals).toBe("20 to 50");
    }
    expect(Object.keys(createUpworkJobSchema.shape)).not.toContain("connectsUsed");
  });
});

/**
 * total = submission Connects + boost Connects.
 *
 * Mirrors upworkTotalConnects() in the extension. Kept as a test-local copy
 * because the extension is plain browser JS with no module system — the panel
 * is the only consumer, and the DOM-level behaviour is covered by the
 * extension's own harness. What is pinned here is the ARITHMETIC CONTRACT the
 * future Sales Cost phase will rely on.
 */
function totalConnects(
  connectsUsed: number | null | undefined,
  boostConnects: number | null | undefined,
): number | null {
  if (connectsUsed === null || connectsUsed === undefined) return null;
  const boost = boostConnects === null || boostConnects === undefined ? 0 : boostConnects;
  return connectsUsed + boost;
}

describe("total Connects for Sales Cost", () => {
  it("no boost -> total equals the base (19 + 0 = 19)", () => {
    expect(totalConnects(19, null)).toBe(19);
    expect(totalConnects(19, 0)).toBe(19);
  });

  it("with boost -> base + boost (19 + 10 = 29)", () => {
    expect(totalConnects(19, 10)).toBe(29);
  });

  it("treats a missing boost as 0, not as unknown", () => {
    // "no boost" and "boost not exposed by Upwork" are the same outcome for
    // cost purposes: nothing extra was charged.
    expect(totalConnects(19, undefined)).toBe(19);
  });

  it("keeps a real 0 base distinct from unknown", () => {
    expect(totalConnects(0, null)).toBe(0);
    expect(totalConnects(0, 5)).toBe(5);
  });

  it("returns null when the base is unknown, even if a boost was found", () => {
    // A boost alone is not a total. Returning 0 here would read as a real,
    // free proposal in the cost calculation.
    expect(totalConnects(null, 10)).toBeNull();
    expect(totalConnects(undefined, 10)).toBeNull();
  });
});

describe("connectsUsed accepts the submission amount (product decision)", () => {
  it("stores 19 from \"Required Connects to submit a proposal: 19\"", () => {
    const r = upworkProposalSchema.safeParse({ proposalId: "p1", connectsUsed: 19, boostConnects: 0 });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.connectsUsed).toBe(19);
      expect(r.data.boostConnects).toBe(0);
    }
  });

  it("still cannot carry the account balance into a listing field", () => {
    // Guard on the payload shape: even if a scrape misread "Available
    // Connects: 107", there is no requiredConnects/proposals key here to
    // corrupt — those stay owned by the job scraper.
    const keys = Object.keys(upworkProposalSchema.shape);
    expect(keys).not.toContain("requiredConnects");
    expect(keys).not.toContain("availableConnects");
  });
});

describe("proposal cover letter", () => {
  it("accepts a multi-paragraph letter and preserves its interior verbatim", () => {
    // Paragraph breaks, blank lines and bullet lines ARE the content - the
    // validator must not collapse them the way scrapedText() would.
    const letter =
      "Hello there,\n\nI have 10 years experience.\n\n\u2022 Azure\n\u2022 Microsoft Partner Program\n\nRegards,\nAdarsh";
    const r = upworkProposalSchema.safeParse({
      proposalId: "p1",
      proposalCoverLetter: letter,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.proposalCoverLetter).toBe(letter);
  });

  it("trims only the outer whitespace", () => {
    const r = upworkProposalSchema.safeParse({
      proposalId: "p1",
      proposalCoverLetter: "\n  Line one.\n\nLine two.  \n",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.proposalCoverLetter).toBe("Line one.\n\nLine two.");
  });

  it("turns an empty / whitespace-only letter into null, not an empty string", () => {
    // "No cover letter" is an absence. An empty string would render as a real,
    // blank letter in the CRM.
    for (const v of ["", "   ", "\n\n"]) {
      const r = upworkProposalSchema.safeParse({
        proposalId: "p1",
        proposalCoverLetter: v,
      });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.proposalCoverLetter).toBeNull();
    }
  });

  it("is optional - a proposal with no letter still validates", () => {
    expect(upworkProposalSchema.safeParse({ proposalId: "p1" }).success).toBe(true);
    expect(
      upworkProposalSchema.safeParse({ proposalId: "p1", proposalCoverLetter: null })
        .success,
    ).toBe(true);
  });

  it("does not collide with the AI-owned clientMessage field", () => {
    // The cover letter has its own column precisely because clientMessage is
    // written by saveUpworkAiAnalysis. The payload must not carry that key.
    const keys = Object.keys(upworkProposalSchema.shape);
    expect(keys).toContain("proposalCoverLetter");
    expect(keys).not.toContain("clientMessage");
    expect(keys).not.toContain("rawData");
  });
});

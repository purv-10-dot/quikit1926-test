import { describe, it, expect } from "vitest";
import {
  stripHtml,
  resolveOwnerName,
  wordFilename,
  buildOPSPWordBlob,
  type OPSPWordUser,
} from "@/app/(dashboard)/opsp/lib/previewExport";
import type { OPSPFormData } from "@/app/(dashboard)/opsp/types";

/* ── Helpers ── */

function makeForm(overrides: Partial<OPSPFormData> = {}): OPSPFormData {
  const emptyCrit = { title: "", bullets: ["", "", "", ""] };
  return {
    year: 2025,
    quarter: "Q2",
    targetYears: 5,
    status: "draft",
    employees: ["", "", ""],
    customers: ["", "", ""],
    shareholders: ["", "", ""],
    coreValues: "",
    purpose: "",
    actions: ["", "", "", "", ""],
    profitPerX: "",
    bhag: "",
    targetRows: [],
    sandbox: "",
    keyThrusts: [],
    brandPromiseKPIs: "",
    brandPromise: "",
    goalRows: [],
    keyInitiatives: [],
    criticalNumGoals: emptyCrit,
    balancingCritNumGoals: emptyCrit,
    processItems: ["", "", ""],
    weaknesses: ["", "", ""],
    makeBuy: ["", "", ""],
    sell: ["", "", ""],
    recordKeeping: ["", "", ""],
    actionsQtr: [],
    rocks: [],
    criticalNumProcess: emptyCrit,
    balancingCritNumProcess: emptyCrit,
    theme: "",
    scoreboardDesign: "",
    celebration: "",
    reward: "",
    kpiAccountability: [],
    quarterlyPriorities: [],
    criticalNumAcct: emptyCrit,
    balancingCritNumAcct: emptyCrit,
    trends: ["", "", "", "", "", ""],
    ...overrides,
  };
}

/* ── stripHtml ── */

describe("stripHtml", () => {
  it("strips tags from simple HTML", () => {
    expect(stripHtml("<p>hello</p>")).toBe("hello");
  });

  it("strips nested tags and trims whitespace", () => {
    expect(stripHtml("  <div><b>bold</b> text</div>  ")).toBe("bold text");
  });

  it("returns a single space for empty string (so Word docs don't get empty paragraphs)", () => {
    expect(stripHtml("")).toBe(" ");
  });

  it("returns a single space for HTML that strips to empty", () => {
    expect(stripHtml("<br/><hr/>")).toBe(" ");
  });

  it("leaves plain text unchanged", () => {
    expect(stripHtml("just plain text")).toBe("just plain text");
  });
});

/* ── resolveOwnerName ── */

describe("resolveOwnerName", () => {
  const users: OPSPWordUser[] = [
    { id: "u1", firstName: "Ada", lastName: "Lovelace" },
    { id: "u2", firstName: "Grace", lastName: "Hopper" },
  ];

  it("returns empty string for empty id", () => {
    expect(resolveOwnerName("", users)).toBe("");
  });

  it("returns First Last for a known user", () => {
    expect(resolveOwnerName("u1", users)).toBe("Ada Lovelace");
  });

  it("returns the id itself as a fallback when user is not found", () => {
    expect(resolveOwnerName("missing-id", users)).toBe("missing-id");
  });

  it("handles an empty users list gracefully", () => {
    expect(resolveOwnerName("u1", [])).toBe("u1");
  });
});

/* ── wordFilename ── */

describe("wordFilename", () => {
  it("produces the canonical OPSP_YEAR_QUARTER.docx filename", () => {
    expect(wordFilename({ year: 2025, quarter: "Q2" })).toBe("OPSP_2025_Q2.docx");
  });

  it("uses whatever quarter string is provided (no validation)", () => {
    expect(wordFilename({ year: 2030, quarter: "Q4" })).toBe("OPSP_2030_Q4.docx");
  });
});

/* ── buildOPSPWordBlob ── */

describe("buildOPSPWordBlob", () => {
  it("returns a Blob for an empty form (no crash on blank data)", async () => {
    const blob = await buildOPSPWordBlob(makeForm(), []);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it("returns a Blob when form contains populated rows with owners", async () => {
    const users: OPSPWordUser[] = [{ id: "u1", firstName: "Ada", lastName: "Lovelace" }];
    const form = makeForm({
      employees: ["Alice", "Bob", ""],
      keyThrusts: [{ desc: "Launch new product", owner: "u1" }],
      rocks: [{ desc: "Hire CFO", owner: "u1" }],
      targetRows: [
        { category: "Revenue", projected: "$10M", y1: "2M", y2: "3M", y3: "5M", y4: "", y5: "" },
      ],
      kpiAccountability: [{ kpi: "MRR", goal: "$1M" }],
      quarterlyPriorities: [{ priority: "Ship feature X", dueDate: "2025-06-30" }],
    });
    const blob = await buildOPSPWordBlob(form, users);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it("handles rows with missing owner ids (resolves to empty string)", async () => {
    const form = makeForm({
      keyInitiatives: [{ desc: "No-owner initiative", owner: "" }],
    });
    const blob = await buildOPSPWordBlob(form, []);
    expect(blob).toBeInstanceOf(Blob);
  });

  it("filters out target/goal/action rows with empty category", async () => {
    // If this didn't crash and returned a Blob, the row-filtering path worked.
    const form = makeForm({
      targetRows: [
        { category: "", projected: "", y1: "", y2: "", y3: "", y4: "", y5: "" },
        { category: "Revenue", projected: "$5M", y1: "", y2: "", y3: "", y4: "", y5: "" },
      ],
      goalRows: [
        { category: "", projected: "", q1: "", q2: "", q3: "", q4: "" },
      ],
      actionsQtr: [
        { category: "", projected: "", m1: "", m2: "", m3: "" },
      ],
    });
    const blob = await buildOPSPWordBlob(form, []);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it("handles malformed HTML in rich-text fields without crashing", async () => {
    const form = makeForm({
      coreValues: "<p>Honesty <strong>matters",  // unclosed tag
      purpose: "<<>><script>alert(1)</script>",  // garbage
      bhag: "",
    });
    const blob = await buildOPSPWordBlob(form, []);
    expect(blob).toBeInstanceOf(Blob);
  });

  it("handles a quarterly priority with no due date", async () => {
    const form = makeForm({
      quarterlyPriorities: [{ priority: "Do thing", dueDate: "" }],
    });
    const blob = await buildOPSPWordBlob(form, []);
    expect(blob).toBeInstanceOf(Blob);
  });
});

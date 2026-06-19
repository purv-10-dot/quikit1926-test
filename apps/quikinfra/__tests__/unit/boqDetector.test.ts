import { describe, it, expect } from "vitest";
import { detectImportMode } from "@/lib/boq/import/detector";
import type { RawSheet } from "@/lib/boq/import/types";

// A strict-only header: col A = "BOQ No", with Unit + Op. Undone Qty but
// NO description-style header — so the generic sniffer's "needs a desc
// column" requirement fails and only strict matches.
const strictSheet = (name = "Civil"): RawSheet => ({
  sheetName: name,
  rows: [["BOQ No", "SOR No", "", "Unit", "Rate", "Op. Undone Qty"]],
});

// A generic-only header: a reference column (S.No.) + a description column,
// but col A is NOT "BOQ No" so the strict sniffer fails.
const genericSheet = (name = "Road"): RawSheet => ({
  sheetName: name,
  rows: [["S.No.", "SOR", "Description", "Unit", "Rate"]],
});

describe("detectImportMode — single sheet verdicts", () => {
  it("detects a strict-only sheet", () => {
    const res = detectImportMode([strictSheet()]);
    expect(res.workbookMode).toBe("STRICT_TEMPLATE");
    expect(res.perSheet[0].detectedMode).toBe("STRICT_TEMPLATE");
    expect(res.perSheet[0].confidence).toBeGreaterThan(0.9);
  });

  it("detects a generic-only sheet", () => {
    const res = detectImportMode([genericSheet()]);
    expect(res.workbookMode).toBe("GENERIC_SOR");
    expect(res.perSheet[0].detectedMode).toBe("GENERIC_SOR");
  });

  it("returns UNKNOWN for an unrecognisable sheet", () => {
    const res = detectImportMode([{ sheetName: "Mystery", rows: [["foo", "bar", "baz"]] }]);
    expect(res.workbookMode).toBe("UNKNOWN");
    expect(res.perSheet[0].detectedMode).toBe("UNKNOWN");
    expect(res.perSheet[0].confidence).toBe(0);
  });

  it("marks an ignored sheet (cover/instructions) as UNKNOWN with confidence 0", () => {
    const res = detectImportMode([{ sheetName: "Instructions", rows: [["BOQ No"]] }]);
    expect(res.perSheet[0].detectedMode).toBe("UNKNOWN");
    expect(res.perSheet[0].reason).toMatch(/ignored/);
    // ignored sheets don't count toward either tally
    expect(res.workbookMode).toBe("UNKNOWN");
  });
});

describe("detectImportMode — tie-break + rollup", () => {
  it("prefers GENERIC when a sheet matches BOTH formats", () => {
    // col A "BOQ No" satisfies strict; "BOQ No" is also a serial alias and
    // "Description" gives generic its desc column → both ok → generic wins.
    const both: RawSheet = {
      sheetName: "Civil",
      rows: [["BOQ No", "SOR No", "Description", "Unit", "Rate", "Op. Undone Qty"]],
    };
    const res = detectImportMode([both]);
    expect(res.perSheet[0].detectedMode).toBe("GENERIC_SOR");
    expect(res.perSheet[0].confidence).toBe(0.7);
    expect(res.perSheet[0].reason).toMatch(/both formats match/);
    expect(res.workbookMode).toBe("GENERIC_SOR");
  });

  it("rolls a mixed strict+generic workbook up to GENERIC_SOR", () => {
    const res = detectImportMode([strictSheet("Civil"), genericSheet("Road")]);
    expect(res.workbookMode).toBe("GENERIC_SOR");
  });

  it("rolls an all-strict workbook (plus an ignored tab) up to STRICT_TEMPLATE", () => {
    const res = detectImportMode([
      strictSheet("Civil"),
      { sheetName: "Cover", rows: [["anything"]] },
    ]);
    expect(res.workbookMode).toBe("STRICT_TEMPLATE");
  });
});

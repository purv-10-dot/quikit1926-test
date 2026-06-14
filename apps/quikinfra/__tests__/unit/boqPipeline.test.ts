import { describe, it, expect } from "vitest";
import { runImportPipeline } from "@/lib/boq/import/pipeline";
import type { PipelineOptions, RawSheet } from "@/lib/boq/import/types";

const STRICT_HEADER = ["BOQ No", "SOR No", "Description", "Unit", "Rate", "Op. Undone Qty"];
const AAKAR_HEADER = [
  "S.No.", "SOR Item No", "SOR Sub Item No", "Item Name",
  "Description of Item", "Unit", "Quantity", "Rate", "Amount",
];

function sheet(rows: any[][], sheetName = "Civil"): RawSheet {
  return { sheetName, rows };
}

const opts = (over: Partial<PipelineOptions> = {}): PipelineOptions => ({
  projectId: "proj-1",
  orgId: "org-1",
  importBatchId: "batch-1",
  ...over,
});

describe("runImportPipeline — detection + dispatch", () => {
  it("runs the strict adapter end to end when STRICT_TEMPLATE is forced", () => {
    // NOTE: the strict header ("BOQ No"/"Description"/"Unit") also satisfies
    // the generic detector, so AUTO detection prefers GENERIC_SOR for it.
    // Force the mode to exercise the strict adapter path explicitly.
    const res = runImportPipeline(
      [sheet([STRICT_HEADER, ["1", "", "Civil", "", "", ""], ["1.1", "", "Excavation", "cum", 50, 10]])],
      opts({ selectedMode: "STRICT_TEMPLATE" }),
    );
    expect(res.mode).toBe("STRICT_TEMPLATE");
    expect(res.summary.totalRows).toBe(2);
    expect(res.summary.leafItems).toBe(1);
    expect(res.summary.groupHeaders).toBe(1);
    expect(res.rows.every((r) => r.importMode === "STRICT_TEMPLATE")).toBe(true);
    // projectId/orgId/batchId enriched
    expect(res.rows[0].projectId).toBe("proj-1");
    expect(res.rows[0].orgId).toBe("org-1");
    expect(res.rows[0].importBatchId).toBe("batch-1");
  });

  it("AUTO-detects an ambiguous strict header as GENERIC_SOR (generic wins the tie)", () => {
    const res = runImportPipeline(
      [sheet([STRICT_HEADER, ["1.1", "", "Excavation", "cum", 50, 10]])],
      opts(),
    );
    expect(res.detectedMode).toBe("GENERIC_SOR");
    expect(res.mode).toBe("GENERIC_SOR");
  });

  it("detects generic SOR and resolves parent hierarchy + sortOrder", () => {
    const res = runImportPipeline(
      [
        sheet([
          AAKAR_HEADER,
          ["1", "4", "", "Chapter", "Chapter 4", "", "", "", ""],     // group 4
          ["2", "4", "4.1", "Sub", "Sub group 4.1", "", "", "", ""],   // group 4.1
          ["3", "4", "4.1.1", "Item", "Leaf 4.1.1", "cum", 10, 5, 50], // leaf 4.1.1
        ]),
      ],
      opts(),
    );
    expect(res.detectedMode).toBe("GENERIC_SOR");
    const byNo = Object.fromEntries(res.rows.map((r) => [r.boqNo, r]));
    expect(byNo["4"].parentBoqNo).toBeNull();
    expect(byNo["4.1"].parentBoqNo).toBe("4");
    expect(byNo["4.1.1"].parentBoqNo).toBe("4.1");
    // sortOrder preserves source order
    expect(byNo["4"].sortOrder).toBeLessThan(byNo["4.1"].sortOrder);
    expect(byNo["4.1"].sortOrder).toBeLessThan(byNo["4.1.1"].sortOrder);
  });

  it("honours an explicit user-selected mode over detection", () => {
    const res = runImportPipeline(
      [sheet([AAKAR_HEADER, ["1", "4", "4.1", "X", "d", "cum", 1, 1, 1]])],
      opts({ selectedMode: "GENERIC_SOR" }),
    );
    expect(res.mode).toBe("GENERIC_SOR");
  });

  it("falls back to GENERIC_SOR when detection is UNKNOWN", () => {
    const res = runImportPipeline([sheet([["foo", "bar"], ["1", "2"]])], opts());
    expect(res.detectedMode).toBe("UNKNOWN");
    expect(res.mode).toBe("GENERIC_SOR");
  });
});

describe("runImportPipeline — dedup auto-suffix", () => {
  it("auto-suffixes a duplicate (category, boqNo) with a non-blocking warning", () => {
    const res = runImportPipeline(
      [
        sheet([
          AAKAR_HEADER,
          ["1", "", "1.1", "First", "First item", "cum", 1, 1, 1],
          ["2", "", "1.1", "Dup", "Duplicate ref", "cum", 2, 2, 4],
        ]),
      ],
      opts(),
    );
    const refs = res.rows.map((r) => r.boqNo).sort();
    expect(refs).toContain("1.1");
    expect(refs).toContain("1.1_2");
    expect(res.warnings.find((w) => w.code === "DUPLICATE_BOQ_NO_IN_CATEGORY")).toBeDefined();
    // The renamed row keeps the original in the audit trail.
    const renamed = res.rows.find((r) => r.boqNo === "1.1_2");
    expect(renamed?.rawBoqNo).toBe("1.1");
  });
});

describe("runImportPipeline — universal mode", () => {
  it("returns UNIVERSAL_MAPPING_REQUIRED error when no mapping is supplied", () => {
    const res = runImportPipeline(
      [sheet([STRICT_HEADER, ["1", "", "X", "cum", 1, 1]])],
      opts({ selectedMode: "UNIVERSAL" }),
    );
    expect(res.mode).toBe("UNIVERSAL");
    expect(res.rows).toHaveLength(0);
    expect(res.errors[0].code).toBe("UNIVERSAL_MAPPING_REQUIRED");
  });

  it("runs the universal adapter when a mapping is supplied", () => {
    const res = runImportPipeline(
      [
        sheet([
          ["BOQ No", "Description", "Unit", "Qty", "Rate"],
          ["1.1", "Mapped item", "cum", "10", "5"],
        ]),
      ],
      opts({
        selectedMode: "UNIVERSAL",
        universalMapping: {
          bySheet: {
            Civil: {
              headerRowIndex: 0,
              colMap: { 0: "boq_number", 1: "description", 2: "unit", 3: "qty_tender", 4: "rate" },
            },
          },
        },
      }),
    );
    expect(res.mode).toBe("UNIVERSAL");
    expect(res.summary.leafItems).toBe(1);
    expect(res.rows[0].boqNo).toBe("1.1");
  });
});

describe("runImportPipeline — summary + samples", () => {
  it("emits NO_VALID_ROWS error and empty summary when nothing parses", () => {
    const res = runImportPipeline([sheet([["foo"], ["bar"]])], opts());
    expect(res.summary.totalRows).toBe(0);
    expect(res.errors.find((e) => e.code === "NO_VALID_ROWS")).toBeDefined();
  });

  it("populates perCategory counts and sampleRows (leaves only, max 10)", () => {
    const leafRows: any[][] = [AAKAR_HEADER];
    for (let i = 1; i <= 12; i++) {
      leafRows.push([String(i), "", `1.${i}`, `Item ${i}`, `desc ${i}`, "cum", 1, 1, 1]);
    }
    const res = runImportPipeline([sheet(leafRows, "Civil")], opts());
    expect(res.summary.perCategory["Civil Building"]).toBeGreaterThan(0);
    expect(res.sampleRows.length).toBeLessThanOrEqual(10);
    expect(res.sampleRows.every((r) => !r.isGroup)).toBe(true);
  });

  it("exposes the supported modes list", () => {
    const res = runImportPipeline([sheet([STRICT_HEADER, ["1", "", "X", "cum", 1, 1]])], opts());
    expect(res.supportedModes).toEqual(
      expect.arrayContaining(["STRICT_TEMPLATE", "GENERIC_SOR", "ALPHABETIC_SOR", "UNIVERSAL"]),
    );
  });
});

import { describe, it, expect } from "vitest";
import {
  looksLikeStrictTemplate,
  runStrictAdapter,
} from "@/lib/boq/import/strict-adapter";
import type { RawSheet } from "@/lib/boq/import/types";

const HEADER = ["BOQ No", "SOR No", "Description", "Unit", "Rate", "Op. Undone Qty"];

function sheet(rows: any[][], sheetName = "Civil"): RawSheet {
  return { sheetName, rows };
}

describe("looksLikeStrictTemplate", () => {
  it("detects the strict template by the BOQ No header in column A", () => {
    const r = looksLikeStrictTemplate(sheet([HEADER, ["1", "", "Earthwork", "cum", 100, 5]]));
    expect(r.ok).toBe(true);
    expect(r.headerRowIndex).toBe(0);
  });

  it("boosts the reason when Unit + Op. Undone Qty headers also match", () => {
    const r = looksLikeStrictTemplate(sheet([HEADER]));
    expect(r.ok).toBe(true);
    expect(r.reason).toMatch(/Unit/);
  });

  it("tolerates a banner above the header (within first 5 rows)", () => {
    const r = looksLikeStrictTemplate(
      sheet([["Project: X"], ["Client: Y"], HEADER, ["1", "", "Item", "nos", 1, 1]]),
    );
    expect(r.ok).toBe(true);
    expect(r.headerRowIndex).toBe(2);
  });

  it("rejects an empty sheet", () => {
    expect(looksLikeStrictTemplate(sheet([])).ok).toBe(false);
  });

  it("rejects a sheet with no BOQ No header in column A", () => {
    const r = looksLikeStrictTemplate(sheet([["S.No.", "Description", "Qty"]]));
    expect(r.ok).toBe(false);
    expect(r.headerRowIndex).toBe(-1);
  });
});

describe("runStrictAdapter", () => {
  it("parses a minimal valid strict sheet and classifies leaf vs group", () => {
    const res = runStrictAdapter([
      sheet([
        HEADER,
        ["1", "", "Civil Works", "", "", ""],          // group (no unit/rate)
        ["1.1", "SOR-9", "Excavation", "cum", 150, 20], // leaf (unit + rate)
      ]),
    ]);
    expect(res.mode).toBe("STRICT_TEMPLATE");
    const rows = res.sheets[0].rows;
    expect(rows).toHaveLength(2);

    const group = rows[0];
    expect(group.boqNo).toBe("1");
    expect(group.isGroup).toBe(true);
    expect(group.unit).toBeNull();
    expect(group.rate).toBeNull();
    expect(group.tenderQty).toBeNull();

    const leaf = rows[1];
    expect(leaf.boqNo).toBe("1.1");
    expect(leaf.isGroup).toBe(false);
    expect(leaf.unit).toBe("cum");
    expect(leaf.rate).toBe(150);
    expect(leaf.tenderQty).toBe(20);
    expect(leaf.estimateAmt).toBe(150 * 20);
    expect(leaf.rawSorNo).toBe("SOR-9");
    expect(leaf.importMode).toBe("STRICT_TEMPLATE");
  });

  it("treats a leaf with qty=0 as a valid leaf and warns QTY_MISSING when qty blank", () => {
    const res = runStrictAdapter([
      sheet([
        HEADER,
        ["2", "", "Zero qty item", "nos", 50, 0],   // qty 0 still leaf, no warning
        ["3", "", "Blank qty item", "nos", 50, ""],  // qty missing -> warning, imported as 0
      ]),
    ]);
    const [zero, blank] = res.sheets[0].rows;
    expect(zero.isGroup).toBe(false);
    expect(zero.tenderQty).toBe(0);
    expect(zero.warnings.find((w) => w.code === "QTY_MISSING")).toBeUndefined();

    expect(blank.isGroup).toBe(false);
    expect(blank.tenderQty).toBe(0);
    expect(blank.warnings.find((w) => w.code === "QTY_MISSING")).toBeDefined();
  });

  it("emits NEGATIVE_QTY (info) and NEGATIVE_RATE (warning) per-row", () => {
    const res = runStrictAdapter([
      sheet([HEADER, ["4", "", "Deduct", "cum", -10, -5]]),
    ]);
    const codes = res.sheets[0].rows[0].warnings.map((w) => w.code);
    expect(codes).toContain("NEGATIVE_QTY");
    expect(codes).toContain("NEGATIVE_RATE");
  });

  it("skips rows with no BOQ No silently (no error, no row)", () => {
    const res = runStrictAdapter([
      sheet([HEADER, ["", "", "stray note", "cum", 1, 1]]),
    ]);
    expect(res.sheets[0].rows).toHaveLength(0);
    expect(res.sheets[0].issues).toHaveLength(0);
  });

  it("skips fully blank rows", () => {
    const res = runStrictAdapter([
      sheet([HEADER, ["", "", "", "", "", ""], ["5", "", "Item", "nos", 10, 1]]),
    ]);
    expect(res.sheets[0].rows).toHaveLength(1);
    expect(res.sheets[0].rows[0].boqNo).toBe("5");
  });

  it("warns DESCRIPTION_MISSING and falls back to BOQ No as display name", () => {
    const res = runStrictAdapter([
      sheet([HEADER, ["6", "", "", "nos", 10, 1]]),
    ]);
    const row = res.sheets[0].rows[0];
    expect(row.displayName).toBe("6");
    expect(row.warnings.find((w) => w.code === "DESCRIPTION_MISSING")).toBeDefined();
  });

  it("preserves 1-based source row numbers for error reporting", () => {
    const res = runStrictAdapter([
      sheet([HEADER, ["7", "", "First", "nos", 1, 1], ["8", "", "Second", "nos", 1, 1]]),
    ]);
    expect(res.sheets[0].rows[0].sourceRowNumber).toBe(2);
    expect(res.sheets[0].rows[1].sourceRowNumber).toBe(3);
  });

  it("computes depth from dots and caps at 5 with a DEPTH_CAPPED warning", () => {
    const res = runStrictAdapter([
      sheet([
        HEADER,
        ["1.2.3", "", "Depth 2", "nos", 1, 1],
        ["1.2.3.4.5.6.7", "", "Too deep", "nos", 1, 1],
      ]),
    ]);
    const [d2, deep] = res.sheets[0].rows;
    expect(d2.depth).toBe(2);
    expect(deep.depth).toBe(5);
    expect(deep.warnings.find((w) => w.code === "DEPTH_CAPPED")).toBeDefined();
  });

  it("returns HEADER_NOT_FOUND error for a sheet missing the strict header", () => {
    const res = runStrictAdapter([
      sheet([["S.No.", "Item", "Qty"], ["1", "x", 5]]),
    ]);
    expect(res.sheets[0].rows).toHaveLength(0);
    expect(res.sheets[0].issues[0].code).toBe("HEADER_NOT_FOUND");
    expect(res.sheets[0].issues[0].severity).toBe("error");
  });

  it("skips instructions / cover sheets with a SHEET_SKIPPED info issue", () => {
    const res = runStrictAdapter([sheet([HEADER], "Instructions")]);
    expect(res.sheets[0].rows).toHaveLength(0);
    expect(res.sheets[0].issues[0].code).toBe("SHEET_SKIPPED");
  });
});

import { describe, it, expect } from "vitest";
import {
  looksLikeGenericSor,
  findGenericHeaderRow,
  runGenericAdapter,
} from "@/lib/boq/import/generic-adapter";
import type { RawSheet } from "@/lib/boq/import/types";

// Classic 9-column Aakar header.
const AAKAR_HEADER = [
  "S.No.",
  "SOR Item No",
  "SOR Sub Item No",
  "Item Name",
  "Description of Item",
  "Unit",
  "Quantity",
  "Rate",
  "Amount",
];

function sheet(rows: any[][], sheetName = "Civil"): RawSheet {
  return { sheetName, rows };
}

describe("detectGenericHeader / looksLikeGenericSor", () => {
  it("detects the classic Aakar header by role aliases", () => {
    const r = looksLikeGenericSor(sheet([AAKAR_HEADER]));
    expect(r.ok).toBe(true);
    expect(r.headerRowIndex).toBe(0);
  });

  it("detects the bare 'SOR' header (the format-fix alias) + a description column", () => {
    const r = looksLikeGenericSor(sheet([["SOR", "Description", "Unit", "Quantity"]]));
    expect(r.ok).toBe(true);
  });

  it("detects a condensed header with I/NO + SOR Numbers + Description", () => {
    const r = looksLikeGenericSor(
      sheet([["I/NO.", "SOR Numbers", "Description", "Total Quantity", "Unit"]]),
    );
    expect(r.ok).toBe(true);
  });

  it("finds the header even when a banner sits above it", () => {
    const r = looksLikeGenericSor(
      sheet([["Project info"], [], AAKAR_HEADER]),
    );
    expect(r.ok).toBe(true);
    expect(r.headerRowIndex).toBe(2);
  });

  it("rejects a sheet with no recognisable reference + description header", () => {
    const r = looksLikeGenericSor(sheet([["foo", "bar", "baz"]]));
    expect(r.ok).toBe(false);
    expect(r.headerRowIndex).toBe(-1);
  });

  it("findGenericHeaderRow returns the row index or -1", () => {
    expect(findGenericHeaderRow(sheet([AAKAR_HEADER]))).toBe(0);
    expect(findGenericHeaderRow(sheet([["foo", "bar"]]))).toBe(-1);
  });
});

describe("runGenericAdapter — leaf vs group classification", () => {
  it("classifies a row with unit + rate as a leaf, otherwise group", () => {
    const res = runGenericAdapter([
      sheet([
        AAKAR_HEADER,
        ["1", "4", "", "Civil", "Civil works header", "", "", "", ""], // group
        ["2", "4", "4.1", "Excavation", "Earthwork in excavation", "cum", 100, 50, 5000], // leaf
      ]),
    ]);
    expect(res.mode).toBe("GENERIC_SOR");
    const rows = res.sheets[0].rows;
    expect(rows).toHaveLength(2);

    const group = rows[0];
    expect(group.boqNo).toBe("4");
    expect(group.isGroup).toBe(true);
    expect(group.unit).toBeNull();

    const leaf = rows[1];
    expect(leaf.boqNo).toBe("4.1");
    expect(leaf.isGroup).toBe(false);
    expect(leaf.unit).toBe("cum");
    expect(leaf.rate).toBe(50);
    expect(leaf.tenderQty).toBe(100);
    expect(leaf.estimateAmt).toBe(5000);
    expect(leaf.excelAmount).toBe(5000);
  });

  it("picks the most-dotted ref across cols C/B/A as boqNo", () => {
    const res = runGenericAdapter([
      sheet([
        AAKAR_HEADER,
        ["1", "4", "4.1.1.4", "X", "desc", "cum", 10, 5, 50],
      ]),
    ]);
    const row = res.sheets[0].rows[0];
    expect(row.boqNo).toBe("4.1.1.4");
    expect(row.rawSerialNo).toBe("1");
    expect(row.rawSorNo).toBe("4");
    expect(row.rawSubNo).toBe("4.1.1.4");
  });

  it("normalises a dangling trailing separator (A.3. -> A.3)", () => {
    const res = runGenericAdapter([
      sheet([
        ["SOR", "Description", "Unit", "Quantity"],
        ["A.3.", "Section header", "", ""],
      ]),
    ]);
    expect(res.sheets[0].rows[0].boqNo).toBe("A.3");
  });
});

describe("runGenericAdapter — letter-only sub-codes (CURRENT behaviour)", () => {
  it("keeps a letter-only ref verbatim with depth 0 (no lastDottedParent synthesis in this build)", () => {
    const res = runGenericAdapter([
      sheet([
        AAKAR_HEADER,
        ["1", "A.2.1", "", "Parent", "Group A.2.1", "", "", "", ""],     // group A.2.1
        ["2", "a", "", "Sub a", "Sub item a", "cum", 5, 10, 50],          // letter-only leaf
        ["3", "b", "", "Sub b", "Sub item b", "cum", 5, 10, 50],          // letter-only leaf
      ]),
    ]);
    const rows = res.sheets[0].rows;
    expect(rows[0].boqNo).toBe("A.2.1");
    // The current adapter does NOT synthesize "A.2.1.a"; the ref stays "a".
    expect(rows[1].boqNo).toBe("a");
    expect(rows[1].depth).toBe(0);
    expect(rows[1].rawBoqNo).toBe("a");
    expect(rows[2].boqNo).toBe("b");
  });
});

describe("runGenericAdapter — depth handling (caps at 3)", () => {
  it("computes depth from dots/dashes and caps at 3 with DEPTH_CAPPED warning", () => {
    const res = runGenericAdapter([
      sheet([
        AAKAR_HEADER,
        ["1", "", "4.1", "X", "d1", "cum", 1, 1, 1],
        ["2", "", "4.1.1.1.1", "Y", "d4 capped", "cum", 1, 1, 1],
      ]),
    ]);
    const [d1, deep] = res.sheets[0].rows;
    expect(d1.depth).toBe(1);
    expect(deep.depth).toBe(3);
    expect(deep.warnings.find((w) => w.code === "DEPTH_CAPPED")).toBeDefined();
  });
});

describe("runGenericAdapter — no rate column", () => {
  it("treats unit-only rows as leaves when there is no Rate column, leaving rate null", () => {
    const res = runGenericAdapter([
      sheet([
        ["SOR", "Description", "Unit", "Quantity"],
        ["1.1", "Item with no rate column", "cum", 12],
      ]),
    ]);
    const row = res.sheets[0].rows[0];
    expect(row.isGroup).toBe(false);
    expect(row.unit).toBe("cum");
    expect(row.rate).toBeNull();
    expect(row.tenderQty).toBe(12);
  });
});

describe("runGenericAdapter — warnings + edge rows", () => {
  it("appends a continuation row (description-only) onto the previous item", () => {
    const res = runGenericAdapter([
      sheet([
        AAKAR_HEADER,
        ["1", "", "1.1", "Item", "First part", "cum", 10, 5, 50],
        ["", "", "", "", "continued text", "", "", "", ""],
      ]),
    ]);
    const rows = res.sheets[0].rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toMatch(/First part continued text/);
  });

  it("emits AMOUNT_MISMATCH when Amount differs from Qty x Rate by >1%", () => {
    const res = runGenericAdapter([
      sheet([
        AAKAR_HEADER,
        ["1", "", "1.1", "X", "desc", "cum", 10, 10, 999], // 10*10=100 vs 999
      ]),
    ]);
    expect(res.sheets[0].rows[0].warnings.find((w) => w.code === "AMOUNT_MISMATCH")).toBeDefined();
  });

  it("emits NEGATIVE_QTY (info) for a deduct line", () => {
    const res = runGenericAdapter([
      sheet([AAKAR_HEADER, ["1", "", "1.1", "X", "deduct", "cum", -5, 10, -50]]),
    ]);
    const w = res.sheets[0].rows[0].warnings.find((x) => x.code === "NEGATIVE_QTY");
    expect(w?.severity).toBe("info");
  });

  it("emits QTY_MISSING when qty column exists but the cell is blank on a leaf", () => {
    const res = runGenericAdapter([
      sheet([AAKAR_HEADER, ["1", "", "1.1", "X", "desc", "cum", "", 10, ""]]),
    ]);
    const row = res.sheets[0].rows[0];
    expect(row.warnings.find((w) => w.code === "QTY_MISSING")).toBeDefined();
    expect(row.tenderQty).toBe(0);
  });

  it("skips rows with no resolvable ref silently", () => {
    const res = runGenericAdapter([
      sheet([AAKAR_HEADER, ["", "", "", "", "stray", "cum", 1, 1, 1]]),
    ]);
    expect(res.sheets[0].rows).toHaveLength(0);
  });

  it("returns HEADER_NOT_FOUND when no header is recognisable", () => {
    const res = runGenericAdapter([sheet([["foo", "bar"], ["1", "2"]])]);
    expect(res.sheets[0].rows).toHaveLength(0);
    expect(res.sheets[0].issues[0].code).toBe("HEADER_NOT_FOUND");
  });
});

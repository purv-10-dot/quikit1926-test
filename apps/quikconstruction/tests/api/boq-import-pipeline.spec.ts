/**
 * Dual BOQ Import Engine — pipeline unit tests
 *
 * Pure-function tests against the import pipeline. No DB, no HTTP, no
 * server start — just feeds raw cell grids through the strict + generic
 * adapters and asserts on the normalised output.
 *
 * Run: pnpm test:api -- boq-import-pipeline
 */

import { test, expect } from "@playwright/test";
import {
  runImportPipeline,
  detectImportMode,
  type RawSheet,
  type PipelineResult,
} from "../../src/lib/boq/import";

// ─── Test fixtures ──────────────────────────────────────────────

function strictHeader() {
  return ["BOQ No", "SOR No", "Description", "Unit", "Rate", "Op. Undone Qty"];
}
function genericHeader() {
  return [
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
}

function strictSheet(name: string, dataRows: any[][]): RawSheet {
  return { sheetName: name, rows: [strictHeader(), ...dataRows] };
}
function genericSheet(name: string, dataRows: any[][], banner: any[][] = []): RawSheet {
  return { sheetName: name, rows: [...banner, genericHeader(), ...dataRows] };
}

const PIPE = (sheets: RawSheet[], selectedMode: any = "AUTO"): PipelineResult =>
  runImportPipeline(sheets, {
    projectId: "p1",
    tenantId: "t1",
    importBatchId: "b1",
    selectedMode,
  });

// ════════════════════════════════════════════════════════════════
// STRICT TEMPLATE TESTS
// ════════════════════════════════════════════════════════════════

test.describe("strict template adapter", () => {
  test("parses a minimal valid strict sheet", () => {
    const sheets: RawSheet[] = [
      strictSheet("Civil_Building", [
        ["1", "", "Foundation works", "", "", ""],          // group
        ["1.1", "", "Excavation", "", "", ""],              // group
        ["1.1.1", "SOR-101", "Excavate soft soil", "cum", 350, 100],
        ["1.1.2", "SOR-102", "Excavate hard soil", "cum", 550, 50],
      ]),
    ];
    const res = PIPE(sheets);
    expect(res.errors).toEqual([]);
    expect(res.summary.totalRows).toBe(4);
    expect(res.summary.leafItems).toBe(2);
    expect(res.summary.groupHeaders).toBe(2);
    expect(res.mode).toBe("STRICT_TEMPLATE");
  });

  test("classifies leaves: unit + rate required, qty=0 still leaf", () => {
    const sheets: RawSheet[] = [
      strictSheet("Civil", [
        ["1", "", "Group", "", "", ""],
        ["1.1", "", "Item with qty=0", "cum", 100, 0],     // leaf w/ qty 0
        ["1.2", "", "Item with negative qty", "cum", 100, -25],
        ["1.3", "", "Group-like (no unit)", "", "", ""],
      ]),
    ];
    const res = PIPE(sheets);
    expect(res.errors).toEqual([]);
    const items = res.rows.filter((r) => !r.isGroup);
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.boqNo === "1.1")?.tenderQty).toBe(0);
    expect(items.find((i) => i.boqNo === "1.2")?.tenderQty).toBe(-25);
  });

  test("rejects rows missing BOQ No", () => {
    const sheets: RawSheet[] = [
      strictSheet("Civil", [
        ["", "", "Orphan description", "cum", 100, 5],
      ]),
    ];
    const res = PIPE(sheets);
    expect(res.errors.some((e) => e.code === "MISSING_BOQ_NO")).toBe(true);
  });

  test("emits HEADER_NOT_FOUND when BOQ No header is missing", () => {
    const sheets: RawSheet[] = [
      { sheetName: "Civil", rows: [["foo", "bar"], ["1", "asdf"]] },
    ];
    const res = PIPE(sheets, "STRICT_TEMPLATE");
    expect(res.errors.some((e) => e.code === "HEADER_NOT_FOUND")).toBe(true);
  });

  test("preserves source row numbers for error reporting", () => {
    const sheets: RawSheet[] = [
      strictSheet("Civil", [
        ["1", "", "Group", "", "", ""],
        ["", "", "Bad row", "cum", 50, 5],
      ]),
    ];
    const res = PIPE(sheets);
    const err = res.errors.find((e) => e.code === "MISSING_BOQ_NO");
    expect(err?.rowNumber).toBe(3); // header row 1, data row 1 = row 2, bad row = row 3
  });
});

// ════════════════════════════════════════════════════════════════
// GENERIC SOR TESTS
// ════════════════════════════════════════════════════════════════

test.describe("generic SOR adapter", () => {
  test("parses a minimal valid generic sheet", () => {
    const sheets: RawSheet[] = [
      genericSheet("Civil_Building", [
        [1, "4", "", "Earthwork", "Excavation in all soils", "", "", "", ""], // group
        [2, "4.1", "4.1.1", "Cut & fill", "Cut and fill works", "cum", 1500, 220, 330000],
        [3, "4.2", "4.2.1", "Disposal", "Disposal of surplus", "cum", 500, 150, 75000],
      ]),
    ];
    const res = PIPE(sheets);
    expect(res.errors).toEqual([]);
    expect(res.summary.totalRows).toBe(3);
    expect(res.summary.leafItems).toBe(2);
    expect(res.mode).toBe("GENERIC_SOR");
  });

  test("auto-detects header row even with banner rows above it", () => {
    const banner = [
      ["Project Name:", "Aakar Reservoir Project"],
      ["Client:", "Govt of MH"],
      ["", ""],
    ];
    const sheets: RawSheet[] = [
      genericSheet(
        "Civil_Building",
        [
          [1, "1", "1.1", "Item A", "Desc A", "cum", 10, 100, 1000],
          [2, "1", "1.2", "Item B", "Desc B", "cum", 5, 200, 1000],
        ],
        banner
      ),
    ];
    const res = PIPE(sheets);
    expect(res.errors).toEqual([]);
    expect(res.summary.totalRows).toBe(2);
  });

  test("qty=0 is a valid leaf, not misclassified as group", () => {
    const sheets: RawSheet[] = [
      genericSheet("Civil", [
        [1, "1", "1.1", "TBD item", "Quantity to be decided", "cum", 0, 100, 0],
      ]),
    ];
    const res = PIPE(sheets);
    expect(res.errors).toEqual([]);
    expect(res.rows[0].isGroup).toBe(false);
    expect(res.rows[0].tenderQty).toBe(0);
  });

  test("negative qty allowed (deduct line), tagged as info warning", () => {
    const sheets: RawSheet[] = [
      genericSheet("Civil", [
        [1, "1", "1.1", "Deduct old", "Deduct previous", "cum", -10, 100, -1000],
      ]),
    ];
    const res = PIPE(sheets);
    expect(res.errors).toEqual([]);
    expect(res.rows[0].tenderQty).toBe(-10);
    // negative qty surfaces an info-severity warning, never an error
    const negWarn = res.warnings.find((w) => w.code === "NEGATIVE_QTY");
    expect(negWarn).toBeDefined();
  });

  test("amount column mismatch is a warning, never overrides Qty × Rate", () => {
    const sheets: RawSheet[] = [
      genericSheet("Civil", [
        // 10 * 100 = 1000, but Excel says 9999
        [1, "1", "1.1", "Item", "Desc", "cum", 10, 100, 9999],
      ]),
    ];
    const res = PIPE(sheets);
    expect(res.errors).toEqual([]);
    expect(res.rows[0].estimateAmt).toBe(1000); // server-computed
    expect(res.warnings.some((w) => w.code === "AMOUNT_MISMATCH")).toBe(true);
  });

  test("HEADER_NOT_FOUND when no S.No header in first 15 rows", () => {
    const sheets: RawSheet[] = [
      { sheetName: "Civil", rows: Array(20).fill(["foo", "bar", "baz"]) },
    ];
    const res = PIPE(sheets, "GENERIC_SOR");
    expect(res.errors.some((e) => e.code === "HEADER_NOT_FOUND")).toBe(true);
  });

  test("continuation row appends to previous description", () => {
    const sheets: RawSheet[] = [
      genericSheet("Civil", [
        [1, "1", "1.1", "Item A", "First sentence.", "cum", 10, 100, 1000],
        ["", "", "", "Continuation line", "Second sentence.", "", "", "", ""],
      ]),
    ];
    const res = PIPE(sheets);
    expect(res.summary.totalRows).toBe(1);
    expect(res.rows[0].description).toContain("Second sentence");
  });
});

// ════════════════════════════════════════════════════════════════
// HIERARCHY RESOLUTION
// ════════════════════════════════════════════════════════════════

test.describe("hierarchy resolution", () => {
  test("resolves parents via prefix match", () => {
    const sheets: RawSheet[] = [
      strictSheet("Civil", [
        ["1", "", "Top", "", "", ""],
        ["1.1", "", "Mid", "", "", ""],
        ["1.1.1", "", "Leaf", "cum", 100, 5],
      ]),
    ];
    const res = PIPE(sheets);
    const leaf = res.rows.find((r) => r.boqNo === "1.1.1")!;
    expect(leaf.parentBoqNo).toBe("1.1");
    expect(leaf.depth).toBe(2);
  });

  test("falls back to stack when prefix is missing", () => {
    // Note: "1.2" doesn't exist but "1.2.5" does — stack fallback should
    // use "1" as the parent.
    const sheets: RawSheet[] = [
      strictSheet("Civil", [
        ["1", "", "Top", "", "", ""],
        ["1.2.5", "", "Out of order leaf", "cum", 100, 5],
      ]),
    ];
    const res = PIPE(sheets);
    const leaf = res.rows.find((r) => r.boqNo === "1.2.5")!;
    expect(leaf.parentBoqNo).toBe("1");
  });

  test("emits ORPHAN_NODE warning when no parent resolves", () => {
    const sheets: RawSheet[] = [
      strictSheet("Civil", [
        ["3.5.7", "", "Floating leaf", "cum", 100, 5],
      ]),
    ];
    const res = PIPE(sheets);
    expect(res.warnings.some((w) => w.code === "ORPHAN_NODE")).toBe(true);
  });

  test("never crosses category boundaries", () => {
    const sheets: RawSheet[] = [
      strictSheet("Civil_Building", [
        ["1", "", "Civil group", "", "", ""],
      ]),
      strictSheet("Electrical", [
        // "1.1" in Electrical must NOT find "1" in Civil as its parent
        ["1.1", "", "Wiring", "m", 50, 100],
      ]),
    ];
    const res = PIPE(sheets);
    const elec = res.rows.find((r) => r.category === "Electrical")!;
    expect(elec.parentBoqNo).toBeNull();
  });

  test("global sortOrder preserves source order across sheets", () => {
    const sheets: RawSheet[] = [
      strictSheet("Civil", [
        ["1", "", "Civil 1", "cum", 100, 1],
        ["2", "", "Civil 2", "cum", 100, 1],
      ]),
      strictSheet("Electrical", [
        ["1", "", "Elec 1", "m", 50, 1],
      ]),
    ];
    const res = PIPE(sheets);
    const orders = res.rows.map((r) => r.sortOrder);
    expect(orders).toEqual([1, 2, 3]);
  });
});

// ════════════════════════════════════════════════════════════════
// CROSS-MODE & DETECTION
// ════════════════════════════════════════════════════════════════

test.describe("detection + mode dispatch", () => {
  test("detects strict template by header signature", () => {
    const sheets: RawSheet[] = [
      strictSheet("Civil_Building", [["1", "", "Item", "cum", 100, 5]]),
    ];
    const det = detectImportMode(sheets);
    expect(det.workbookMode).toBe("STRICT_TEMPLATE");
  });

  test("detects generic SOR by S.No. header signature", () => {
    const sheets: RawSheet[] = [
      genericSheet("Civil_Building", [[1, "1", "1.1", "X", "Y", "cum", 10, 100, 1000]]),
    ];
    const det = detectImportMode(sheets);
    expect(det.workbookMode).toBe("GENERIC_SOR");
  });

  test("ignores instructions / quick reference tabs", () => {
    const sheets: RawSheet[] = [
      { sheetName: "INSTRUCTIONS", rows: [["how to use this template"]] },
      { sheetName: "QUICK_REFERENCE", rows: [["legend"]] },
      strictSheet("Civil_Building", [["1", "", "Item", "cum", 100, 5]]),
    ];
    const res = PIPE(sheets);
    expect(res.errors).toEqual([]);
    expect(res.summary.totalRows).toBe(1);
  });

  test("respects user-forced mode even when detection says otherwise", () => {
    const sheets: RawSheet[] = [
      genericSheet("Civil", [[1, "1", "1.1", "X", "Y", "cum", 10, 100, 1000]]),
    ];
    // Force STRICT — detection would say GENERIC; forced mode should win
    const res = PIPE(sheets, "STRICT_TEMPLATE");
    // In strict mode, the generic sheet won't have a "BOQ No" header and
    // will produce HEADER_NOT_FOUND — that's the correct behavior when the
    // user forces an incompatible mode.
    expect(res.mode).toBe("STRICT_TEMPLATE");
    expect(res.errors.some((e) => e.code === "HEADER_NOT_FOUND")).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════
// VALIDATION
// ════════════════════════════════════════════════════════════════

test.describe("cross-row validation", () => {
  test("DUPLICATE_BOQ_NO_IN_CATEGORY rejected", () => {
    const sheets: RawSheet[] = [
      strictSheet("Civil", [
        ["1.1", "", "First", "cum", 100, 5],
        ["1.1", "", "Duplicate", "cum", 100, 10],
      ]),
    ];
    const res = PIPE(sheets);
    expect(res.errors.some((e) => e.code === "DUPLICATE_BOQ_NO_IN_CATEGORY")).toBe(true);
  });

  test("same boqNo allowed across DIFFERENT categories", () => {
    const sheets: RawSheet[] = [
      strictSheet("Civil_Building", [["1.1", "", "Civil", "cum", 100, 5]]),
      strictSheet("Electrical", [["1.1", "", "Elec", "m", 50, 100]]),
    ];
    const res = PIPE(sheets);
    expect(res.errors).toEqual([]);
    expect(res.summary.totalRows).toBe(2);
  });

  test("NO_VALID_ROWS error when nothing parses", () => {
    const sheets: RawSheet[] = [
      strictSheet("Civil", []),
    ];
    const res = PIPE(sheets);
    expect(res.errors.some((e) => e.code === "NO_VALID_ROWS")).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════
// CATEGORY MAPPING
// ════════════════════════════════════════════════════════════════

test.describe("category mapping", () => {
  test("Civil_Building / Civil → Civil Building", () => {
    const a = PIPE([strictSheet("Civil_Building", [["1", "", "x", "cum", 1, 1]])]);
    const b = PIPE([strictSheet("Civil", [["1", "", "x", "cum", 1, 1]])]);
    expect(a.rows[0].category).toBe("Civil Building");
    expect(b.rows[0].category).toBe("Civil Building");
  });

  test("Ele, / Electrical / electric → Electrical", () => {
    const a = PIPE([strictSheet("Ele,", [["1", "", "x", "m", 1, 1]])]);
    const b = PIPE([strictSheet("Electrical", [["1", "", "x", "m", 1, 1]])]);
    expect(a.rows[0].category).toBe("Electrical");
    expect(b.rows[0].category).toBe("Electrical");
  });

  test("unknown category passes through with warning", () => {
    const sheets: RawSheet[] = [
      strictSheet("HVAC", [["1", "", "AHU install", "nos", 50000, 4]]),
    ];
    const res = PIPE(sheets);
    expect(res.errors).toEqual([]);
    expect(res.rows[0].category).toBe("HVAC");
    expect(res.warnings.some((w) => w.code === "CATEGORY_PASSTHROUGH")).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════
// DEPTH HANDLING
// ════════════════════════════════════════════════════════════════

test.describe("depth handling", () => {
  test("deep refs cap at depth 5 with warning", () => {
    const sheets: RawSheet[] = [
      strictSheet("Civil", [
        ["1", "", "L0", "", "", ""],
        ["1.1", "", "L1", "", "", ""],
        ["1.1.1", "", "L2", "", "", ""],
        ["1.1.1.1", "", "L3", "", "", ""],
        ["1.1.1.1.1", "", "L4", "", "", ""],
        ["1.1.1.1.1.1", "", "L5", "cum", 100, 5],
        ["1.1.1.1.1.1.1", "", "L6 capped", "cum", 100, 5],
      ]),
    ];
    const res = PIPE(sheets);
    const capped = res.rows.find((r) => r.boqNo === "1.1.1.1.1.1.1")!;
    expect(capped.depth).toBe(5);
    expect(res.warnings.some((w) => w.code === "DEPTH_CAPPED")).toBe(true);
  });

  test("alphanumeric suffix doesn't add depth", () => {
    const sheets: RawSheet[] = [
      strictSheet("Civil", [
        ["1", "", "Top", "", "", ""],
        ["1.1", "", "Mid", "", "", ""],
        ["1.1.1a", "", "Suffix variant", "cum", 100, 5],
        ["1.1.1b", "", "Another suffix", "cum", 100, 5],
      ]),
    ];
    const res = PIPE(sheets);
    const a = res.rows.find((r) => r.boqNo === "1.1.1a")!;
    expect(a.depth).toBe(2);
    expect(a.parentBoqNo).toBe("1.1");
  });
});

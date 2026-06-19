import { describe, it, expect } from "vitest";
import { parseBOQSheet, parseBOQWorkbook } from "@/lib/boq/parser";
import type { ExcelRow, MultiSheetInput } from "@/lib/boq/types";

// Helper: build a 9-cell ExcelRow [S.No, SOR Item, SOR Sub, Item Name, Desc, Unit, Qty, Rate, Amount]
function row(
  cells: Partial<{
    a: any; b: any; c: any; d: any; e: any; f: any; g: any; h: any; i: any;
  }>,
): ExcelRow {
  return [
    cells.a ?? null,
    cells.b ?? null,
    cells.c ?? null,
    cells.d ?? null,
    cells.e ?? null,
    cells.f ?? null,
    cells.g ?? null,
    cells.h ?? null,
    cells.i ?? null,
  ] as ExcelRow;
}

const opts = { projectId: "p1", sheetCategory: "Civil Building", batchId: "b1" };

describe("parseBOQSheet — classification + hierarchy", () => {
  it("classifies leaf (unit + non-zero qty) vs group, and resolves parents via stack", () => {
    const { nodes } = parseBOQSheet(
      [
        row({ b: "4", e: "Chapter 4" }),                       // group depth 0
        row({ c: "4.1", e: "Sub group" }),                     // group depth 1
        row({ c: "4.1.1", e: "Excavation", f: "cum", g: 100, h: 50 }), // leaf depth 2
      ],
      opts,
    );
    expect(nodes).toHaveLength(3);
    const byNo = Object.fromEntries(nodes.map((n) => [n.boq_no, n]));
    expect(byNo["4"].is_group).toBe(true);
    expect(byNo["4"].parent_boq_no).toBeNull();
    expect(byNo["4.1"].parent_boq_no).toBe("4");
    expect(byNo["4.1.1"].parent_boq_no).toBe("4.1");
    expect(byNo["4.1.1"].is_group).toBe(false);
    expect(byNo["4.1.1"].depth).toBe(2);
    expect(byNo["4.1.1"].rate).toBe(50);
    expect(byNo["4.1.1"].tender_qty).toBe(100);
  });

  it("prefers col C > col B > col A for the reference number", () => {
    const { nodes } = parseBOQSheet([row({ a: "1", b: "4", c: "4.1.1.4", e: "x" })], opts);
    expect(nodes[0].boq_no).toBe("4.1.1.4");
  });

  it("treats qty=0 as a group (legacy parser rule), unlike the strict adapter", () => {
    const { nodes } = parseBOQSheet([row({ c: "4.1", e: "Zero qty", f: "cum", g: 0, h: 5 })], opts);
    expect(nodes[0].is_group).toBe(true);
    expect(nodes[0].unit).toBeNull();
  });

  it("assigns ascending sort_order from the start row number", () => {
    const { nodes } = parseBOQSheet(
      [row({ b: "1", e: "A" }), row({ b: "2", e: "B" })],
      opts,
    );
    expect(nodes[0].sort_order).toBe(1);
    expect(nodes[1].sort_order).toBe(2);
    expect(nodes[0]._row_number).toBe(4); // default startRow
  });
});

describe("parseBOQSheet — validation rules", () => {
  it("V04: rejects a duplicate boq_no within a sheet", () => {
    const { nodes, issues } = parseBOQSheet(
      [
        row({ c: "4.1", e: "first", f: "cum", g: 10, h: 1 }),
        row({ c: "4.1", e: "dup", f: "cum", g: 20, h: 1 }),
      ],
      opts,
    );
    expect(nodes).toHaveLength(1);
    expect(issues.find((x) => x.rule === "V04")?.severity).toBe("error");
  });

  it("V05: rejects refs nested deeper than depth 5", () => {
    const { nodes, issues } = parseBOQSheet(
      [row({ c: "1.2.3.4.5.6.7", e: "too deep", f: "cum", g: 1, h: 1 })],
      opts,
    );
    expect(nodes).toHaveLength(0);
    expect(issues.find((x) => x.rule === "V05")?.severity).toBe("error");
  });

  it("V03: warns + imports rate 0 when a leaf has a missing/invalid rate", () => {
    const { nodes, issues } = parseBOQSheet(
      [row({ c: "1.1", e: "no rate", f: "cum", g: 10, h: "" })],
      opts,
    );
    expect(nodes[0].rate).toBe(0);
    expect(issues.find((x) => x.rule === "V03")?.severity).toBe("warning");
  });

  it("V06: warns when a row has no name or description", () => {
    const { issues } = parseBOQSheet([row({ c: "1.1", f: "cum", g: 10, h: 1 })], opts);
    expect(issues.find((x) => x.rule === "V06")).toBeDefined();
  });

  it("V11: flags a negative-qty leaf as a deduct item", () => {
    const { nodes, issues } = parseBOQSheet(
      [row({ c: "1.1", e: "deduct", f: "cum", g: -5, h: 10 })],
      opts,
    );
    expect(nodes[0].is_negative).toBe(true);
    expect(issues.find((x) => x.rule === "V11")?.severity).toBe("warning");
  });

  it("V10: warns when the Excel amount diverges from Qty x Rate by >1%", () => {
    const { issues } = parseBOQSheet(
      [row({ c: "1.1", e: "x", f: "cum", g: 10, h: 10, i: 999 })],
      opts,
    );
    expect(issues.find((x) => x.rule === "V10")).toBeDefined();
  });
});

describe("parseBOQSheet — edge cases", () => {
  it("skips fully blank rows", () => {
    const { nodes } = parseBOQSheet([row({}), row({ b: "1", e: "Real" })], opts);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].boq_no).toBe("1");
  });

  it("appends a continuation row onto the previous node's description", () => {
    const { nodes } = parseBOQSheet(
      [
        row({ c: "1.1", e: "First part", f: "cum", g: 10, h: 1 }),
        row({ d: "and second part" }),
      ],
      opts,
    );
    expect(nodes).toHaveLength(1);
    expect(nodes[0].description).toMatch(/First part and second part/);
  });

  it("parses comma-grouped Indian numbers", () => {
    const { nodes } = parseBOQSheet([row({ c: "1.1", e: "x", f: "cum", g: "1,000", h: "9,26,500" })], opts);
    expect(nodes[0].tender_qty).toBe(1000);
    expect(nodes[0].rate).toBe(926500);
  });

  it("strips a trailing alphanumeric suffix for depth (1.1.2a -> depth 2)", () => {
    const { nodes } = parseBOQSheet([row({ c: "1.1.2a", e: "x", f: "cum", g: 1, h: 1 })], opts);
    expect(nodes[0].depth).toBe(2);
  });
});

describe("parseBOQWorkbook", () => {
  it("parses only recognised sheet names and maps them to categories", () => {
    const sheets: MultiSheetInput[] = [
      { sheetName: "Civil_Building", rows: [row({ c: "1.1", e: "x", f: "cum", g: 10, h: 1 })] },
      { sheetName: "INSTRUCTIONS", rows: [row({ c: "9.9", e: "skip me", f: "cum", g: 1, h: 1 })] },
    ];
    const { nodes } = parseBOQWorkbook(sheets, "p1", "b1");
    expect(nodes).toHaveLength(1);
    expect(nodes[0].category).toBe("Civil Building");
  });

  it("V09: warns on a recognised sheet that has no rows", () => {
    const { issues } = parseBOQWorkbook([{ sheetName: "Electrical", rows: [] }], "p1", "b1");
    expect(issues.find((x) => x.rule === "V09")).toBeDefined();
  });
});

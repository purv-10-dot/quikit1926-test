import { describe, it, expect } from "vitest";
import {
  detectUniversalHeader,
  detectColumnsForSheet,
  runUniversalAdapter,
} from "@/lib/boq/import/universal-adapter";
import type { UniversalMapping } from "@/lib/boq/import/universal-adapter";
import type { RawSheet } from "@/lib/boq/import/types";

function sheet(rows: any[][], sheetName = "Civil"): RawSheet {
  return { sheetName, rows };
}

describe("detectUniversalHeader", () => {
  it("scores a keyword-rich row as the header", () => {
    const r = detectUniversalHeader(
      sheet([
        ["Project info"],
        ["BOQ No", "Description", "Unit", "Quantity", "Rate", "Amount"],
        ["1", "Item", "cum", 10, 5, 50],
      ]),
    );
    expect(r).not.toBeNull();
    expect(r!.rowIndex).toBe(1);
    expect(r!.score).toBeGreaterThanOrEqual(0.3);
  });

  it("returns null when no row scores >= 0.3 with >=3 non-empty cells", () => {
    const r = detectUniversalHeader(sheet([["x", "y"], ["1", "2"]]));
    expect(r).toBeNull();
  });
});

describe("detectColumnsForSheet — auto-suggestions", () => {
  it("suggests boq_number / description / unit / qty fields from header names", () => {
    const det = detectColumnsForSheet(
      sheet([
        ["S.No", "Description", "Unit", "Quantity", "Rate"],
        ["1", "Excavation in soil", "cum", "100", "50"],
        ["2", "Concreting work here", "cum", "20", "5000"],
      ]),
    );
    expect(det.headerRowIndex).toBe(0);
    const byIndex = Object.fromEntries(det.columns.map((c) => [c.index, c.suggested]));
    expect(byIndex[0]).toBe("boq_number");
    expect(byIndex[1]).toBe("description");
    expect(byIndex[2]).toBe("unit");
    expect(byIndex[3]).toBe("qty_tender");
    expect(byIndex[4]).toBe("rate");
  });

  it("auto-suggests boq_number for a bare 'SOR' header (format-fix pattern)", () => {
    const det = detectColumnsForSheet(
      sheet([
        ["SOR", "Description", "Unit", "Quantity"],
        ["A.1", "Some long description text", "cum", "5"],
      ]),
    );
    const sorCol = det.columns.find((c) => c.name === "SOR");
    expect(sorCol?.suggested).toBe("boq_number");
  });

  it("returns an empty column list when no header is confident", () => {
    const det = detectColumnsForSheet(sheet([["a"], ["b"]]));
    expect(det.headerRowIndex).toBe(-1);
    expect(det.columns).toHaveLength(0);
  });
});

describe("runUniversalAdapter — manual mapping mode", () => {
  const mapping = (): UniversalMapping => ({
    bySheet: {
      Civil: {
        headerRowIndex: 0,
        colMap: { 0: "boq_number", 1: "description", 2: "unit", 3: "qty_tender", 4: "rate" },
      },
    },
  });

  it("applies the user column map and classifies LINE_ITEM vs SECTION_HEADER", () => {
    const res = runUniversalAdapter(
      [
        sheet([
          ["BOQ No", "Description", "Unit", "Qty", "Rate"],
          ["1", "Civil works", "", "", ""],          // section header
          ["1.1", "Excavation", "cum", "100", "50"],  // line item
        ]),
      ],
      mapping(),
    );
    expect(res.mode).toBe("GENERIC_SOR"); // universal stores as GENERIC_SOR
    const rows = res.sheets[0].rows;
    expect(rows).toHaveLength(2);

    const header = rows[0];
    expect(header.boqNo).toBe("1");
    expect(header.isGroup).toBe(true);
    expect(header.unit).toBeNull();

    const item = rows[1];
    expect(item.boqNo).toBe("1.1");
    expect(item.isGroup).toBe(false);
    expect(item.unit).toBe("CUM");
    expect(item.tenderQty).toBe(100);
    expect(item.rate).toBe(50);
    expect(item.estimateAmt).toBe(5000);
    expect(item.depth).toBe(1);
  });

  it("auto-generates boqNo when no boq_number column is mapped", () => {
    const res = runUniversalAdapter(
      [
        sheet([
          ["Description", "Unit", "Qty"],
          ["Section A", "", ""],          // header -> "1"
          ["Item one", "cum", "10"],       // item -> "1.1"
          ["Item two", "nos", "2"],        // item -> "1.2"
        ]),
      ],
      {
        bySheet: {
          Civil: {
            headerRowIndex: 0,
            colMap: { 0: "description", 1: "unit", 2: "qty_tender" },
          },
        },
      },
    );
    const rows = res.sheets[0].rows;
    expect(rows[0].boqNo).toBe("1");
    expect(rows[0].isGroup).toBe(true);
    expect(rows[1].boqNo).toBe("1.1");
    expect(rows[2].boqNo).toBe("1.2");
  });

  it("parses Indian-format numbers via parseIndianNumber", () => {
    const res = runUniversalAdapter(
      [
        sheet([
          ["BOQ No", "Description", "Unit", "Qty", "Rate"],
          ["1.1", "Lakh rate", "cum", "10", "1,23,456.78"],
        ]),
      ],
      mapping(),
    );
    expect(res.sheets[0].rows[0].rate).toBeCloseTo(123456.78, 2);
  });

  it("skips SUBTOTAL rows", () => {
    const res = runUniversalAdapter(
      [
        sheet([
          ["BOQ No", "Description", "Unit", "Qty", "Rate"],
          ["", "Sub Total", "", "", ""],
          ["1.1", "Real item", "cum", "10", "5"],
        ]),
      ],
      mapping(),
    );
    const rows = res.sheets[0].rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].boqNo).toBe("1.1");
  });

  it("warns UNKNOWN_UOM for a non-standard unit on a line item", () => {
    const res = runUniversalAdapter(
      [
        sheet([
          ["BOQ No", "Description", "Unit", "Qty", "Rate"],
          ["1.1", "Weird unit item", "blobs", "1", "1"],
        ]),
      ],
      mapping(),
    );
    const row = res.sheets[0].rows[0];
    expect(row.isGroup).toBe(false);
    expect(row.warnings.find((w) => w.code === "UNKNOWN_UOM")).toBeDefined();
  });

  it("caps depth at 3 from BOQ No separators", () => {
    const res = runUniversalAdapter(
      [
        sheet([
          ["BOQ No", "Description", "Unit", "Qty", "Rate"],
          ["1.1.1.1.1", "Deep item", "cum", "1", "1"],
        ]),
      ],
      mapping(),
    );
    expect(res.sheets[0].rows[0].depth).toBe(3);
  });

  it("reports NO_MAPPING_FOR_SHEET when a sheet has no mapping", () => {
    const res = runUniversalAdapter([sheet([["x"]], "Unmapped")], mapping());
    expect(res.sheets).toHaveLength(0);
    expect(res.issues[0].code).toBe("NO_MAPPING_FOR_SHEET");
  });

  it("skips instructions/cover sheets", () => {
    const res = runUniversalAdapter(
      [sheet([["BOQ No", "Description"]], "Cover")],
      { bySheet: { Cover: { headerRowIndex: 0, colMap: { 0: "boq_number" } } } },
    );
    expect(res.sheets[0].rows).toHaveLength(0);
    expect(res.sheets[0].issues[0].code).toBe("SHEET_SKIPPED");
  });
});

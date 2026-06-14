import { describe, it, expect } from "vitest";
import { validateNormalizedRows } from "@/lib/boq/import/validator";
import type { NormalizedBoqRow, ImportIssue } from "@/lib/boq/import/types";

let seq = 0;
function row(
  boqNo: string,
  category = "Civil",
  extra: Partial<NormalizedBoqRow> = {},
): NormalizedBoqRow {
  seq++;
  return {
    projectId: "p",
    orgId: "o",
    importMode: "GENERIC_SOR",
    importBatchId: null,
    category,
    sourceSheet: category,
    sourceRowNumber: seq,
    rawSerialNo: null,
    rawSorNo: null,
    rawSubNo: null,
    rawBoqNo: null,
    boqNo,
    parentBoqNo: null,
    depth: 0,
    sortOrder: 0,
    isGroup: false,
    displayName: boqNo,
    itemName: boqNo,
    description: "",
    unit: null,
    tenderQty: null,
    rate: null,
    estimateAmt: null,
    excelAmount: null,
    scopeQty: 0,
    subDoneQty: 0,
    selfDoneQty: 0,
    billedQty: 0,
    warnings: [],
    ...extra,
  };
}

describe("validateNormalizedRows — per-row warning rollup", () => {
  it("splits attached row warnings into errors vs warnings by severity", () => {
    const errIssue: ImportIssue = { code: "BAD", severity: "error", message: "boom" };
    const warnIssue: ImportIssue = { code: "MEH", severity: "warning", message: "meh" };
    const r = row("1", "Civil", { warnings: [errIssue, warnIssue] });
    const res = validateNormalizedRows([r]);
    expect(res.errors).toContainEqual(errIssue);
    expect(res.warnings).toContainEqual(warnIssue);
  });
});

describe("validateNormalizedRows — duplicate auto-suffix", () => {
  it("renames the 2nd and 3rd duplicate in a category to _2 / _3 with warnings", () => {
    const res = validateNormalizedRows([
      row("a", "Civil"),
      row("a", "Civil"),
      row("a", "Civil"),
    ]);
    expect(res.rows.map((r) => r.boqNo)).toEqual(["a", "a_2", "a_3"]);
    const dupWarnings = res.warnings.filter((w) => w.code === "DUPLICATE_BOQ_NO_IN_CATEGORY");
    expect(dupWarnings).toHaveLength(2);
    // It is a non-blocking warning, not an error.
    expect(res.errors).toHaveLength(0);
  });

  it("preserves the original ref in rawBoqNo (audit trail)", () => {
    const res = validateNormalizedRows([row("a", "Civil"), row("a", "Civil")]);
    const renamed = res.rows[1];
    expect(renamed.boqNo).toBe("a_2");
    expect(renamed.rawBoqNo).toBe("a");
  });

  it("does NOT treat the same ref under different categories as a duplicate", () => {
    const res = validateNormalizedRows([row("a", "Civil"), row("a", "Electrical")]);
    expect(res.rows.map((r) => r.boqNo)).toEqual(["a", "a"]);
    expect(res.warnings.filter((w) => w.code === "DUPLICATE_BOQ_NO_IN_CATEGORY")).toHaveLength(0);
  });

  it("skips a suffix that is already taken by an explicit row", () => {
    // explicit "a_2" already present → 2nd "a" must become "a_3".
    const res = validateNormalizedRows([
      row("a", "Civil"),
      row("a_2", "Civil"),
      row("a", "Civil"),
    ]);
    expect(res.rows.map((r) => r.boqNo)).toEqual(["a", "a_2", "a_3"]);
  });
});

describe("validateNormalizedRows — empty input", () => {
  it("raises NO_VALID_ROWS when nothing survives", () => {
    const res = validateNormalizedRows([]);
    expect(res.rows).toHaveLength(0);
    expect(res.errors.some((e) => e.code === "NO_VALID_ROWS")).toBe(true);
  });
});

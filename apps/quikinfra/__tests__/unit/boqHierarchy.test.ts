import { describe, it, expect } from "vitest";
import { resolveHierarchy } from "@/lib/boq/import/hierarchy";
import type { NormalizedBoqRow } from "@/lib/boq/import/types";

let seq = 0;
function row(
  boqNo: string,
  depth: number,
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
    rawBoqNo: boqNo,
    boqNo,
    parentBoqNo: null,
    depth,
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

describe("resolveHierarchy — basics", () => {
  it("returns empty result for no rows", () => {
    const res = resolveHierarchy([]);
    expect(res.rows).toEqual([]);
    expect(res.issues).toEqual([]);
  });

  it("assigns a global sortOrder starting at 1, in source order", () => {
    const res = resolveHierarchy([row("1", 0), row("1.1", 1), row("1.2", 1)]);
    expect(res.rows.map((r) => r.sortOrder)).toEqual([1, 2, 3]);
  });
});

describe("resolveHierarchy — prefix-first resolution", () => {
  it("links a child to its prefix parent in the same category", () => {
    const res = resolveHierarchy([row("1", 0), row("1.2", 1), row("1.2.3", 2)]);
    const byNo = Object.fromEntries(res.rows.map((r) => [r.boqNo, r.parentBoqNo]));
    expect(byNo["1"]).toBeNull();
    expect(byNo["1.2"]).toBe("1");
    expect(byNo["1.2.3"]).toBe("1.2");
  });

  it("resolves a letter-suffixed ref to its dotted prefix parent", () => {
    // "1.2.3a" → prefixParent strips the letter → "1.2"
    const res = resolveHierarchy([row("1", 0), row("1.2", 1), row("1.2.3a", 2)]);
    const child = res.rows.find((r) => r.boqNo === "1.2.3a")!;
    expect(child.parentBoqNo).toBe("1.2");
  });

  it("handles non-contiguous numbering via stack fallback when prefix is absent", () => {
    // "1.2.5" with no "1.2" present: prefix "1.2" missing, stack fallback
    // looks for an ancestor whose code is a true prefix → "1".
    const res = resolveHierarchy([row("1", 0), row("1.2.5", 2)]);
    const child = res.rows.find((r) => r.boqNo === "1.2.5")!;
    expect(child.parentBoqNo).toBe("1");
  });
});

describe("resolveHierarchy — stack fallback guard (no branch bridging)", () => {
  it("does NOT bridge to a stack ancestor that is not a true prefix", () => {
    // A.8.A.1 whose prefix A.8.A is absent must NOT grab A.7.1 from the stack.
    const res = resolveHierarchy([
      row("A", 0),
      row("A.7", 1),
      row("A.7.1", 2),
      row("A.8.A.1", 2),
    ]);
    const orphanish = res.rows.find((r) => r.boqNo === "A.8.A.1")!;
    // A.7.1 is not a prefix of A.8.A.1; only "A" is → parent should be "A".
    expect(orphanish.parentBoqNo).toBe("A");
  });
});

describe("resolveHierarchy — orphan detection", () => {
  it("emits ORPHAN_NODE when a depth>0 row has no resolvable parent", () => {
    const res = resolveHierarchy([row("9.9.9", 2)]);
    const child = res.rows[0];
    expect(child.parentBoqNo).toBeNull();
    expect(res.issues).toHaveLength(1);
    expect(res.issues[0].code).toBe("ORPHAN_NODE");
    expect(res.issues[0].severity).toBe("warning");
  });

  it("does not flag a depth-0 row as an orphan", () => {
    const res = resolveHierarchy([row("1", 0)]);
    expect(res.issues).toHaveLength(0);
  });
});

describe("resolveHierarchy — category isolation", () => {
  it("never resolves a parent across categories", () => {
    const res = resolveHierarchy([
      row("1", 0, "Civil"),
      row("1.1", 1, "Electrical"),
    ]);
    const elec = res.rows.find((r) => r.category === "Electrical" && r.boqNo === "1.1")!;
    // "1" exists only in Civil → Electrical "1.1" cannot resolve to it.
    expect(elec.parentBoqNo).toBeNull();
    expect(res.issues.some((i) => i.code === "ORPHAN_NODE")).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import {
  buildRfqLinesFromIndent,
  type IndentSeedLine,
} from "@/lib/purchase/rfq-line-seed";

// Stub resolver — stands in for the page's item-master reconciliation.
const resolve = (l: IndentSeedLine) => ({
  itemId: `item-for-${l.id ?? l.lineId ?? "x"}`,
  prefillGroupId: "grp-1",
  uomCode: "NOS",
});

describe("buildRfqLinesFromIndent", () => {
  it("carries the indent line id onto sourceIndentLineId (the PR→Indent→PO chain link)", () => {
    // Regression: the RFQ drawer used to drop this field, which left every
    // RFQ-sourced PO with a null indent link and the source PR/Indent
    // permanently reading "Not ordered".
    const indentLines: IndentSeedLine[] = [
      { id: "il-1", qtyRequested: 12, uomCode: "BARREL" },
      { id: "il-2", quantity: "5" },
    ];

    const seeded = buildRfqLinesFromIndent(indentLines, resolve);

    expect(seeded).toHaveLength(2);
    expect(seeded[0].sourceIndentLineId).toBe("il-1");
    expect(seeded[1].sourceIndentLineId).toBe("il-2");
  });

  it("falls back to lineId when id is absent, else null", () => {
    const seeded = buildRfqLinesFromIndent(
      [{ lineId: "il-legacy" }, { itemName: "no-id-line" } as IndentSeedLine],
      resolve,
    );
    expect(seeded[0].sourceIndentLineId).toBe("il-legacy");
    expect(seeded[1].sourceIndentLineId).toBeNull();
  });

  it("maps quantity from the first present of qtyRequested → indentedQty → quantity", () => {
    const seeded = buildRfqLinesFromIndent(
      [
        { id: "a", qtyRequested: 3, indentedQty: 9, quantity: 99 },
        { id: "b", indentedQty: 7, quantity: 99 },
        { id: "c", quantity: 4 },
        { id: "d" },
      ],
      resolve,
    );
    expect(seeded[0].quantity).toBe("3");
    expect(seeded[1].quantity).toBe("7");
    expect(seeded[2].quantity).toBe("4");
    expect(seeded[3].quantity).toBe("");
  });

  it("prefers the indent line's own uomCode over the resolved master uom", () => {
    const seeded = buildRfqLinesFromIndent(
      [{ id: "a", uomCode: "BARREL" }, { id: "b" }],
      resolve,
    );
    expect(seeded[0].uomCode).toBe("BARREL"); // from the line
    expect(seeded[1].uomCode).toBe("NOS"); // from the resolver fallback
  });

  it("returns an empty array for null/undefined input", () => {
    expect(buildRfqLinesFromIndent(null, resolve)).toEqual([]);
    expect(buildRfqLinesFromIndent(undefined, resolve)).toEqual([]);
  });
});

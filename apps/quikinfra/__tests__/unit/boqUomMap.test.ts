import { describe, it, expect } from "vitest";
import { normalizeUom, isKnownUom, CANONICAL_UOMS } from "@/lib/boq/import/uom-map";

describe("normalizeUom", () => {
  it("returns '' for null/undefined/blank", () => {
    expect(normalizeUom(null)).toBe("");
    expect(normalizeUom(undefined)).toBe("");
    expect(normalizeUom("   ")).toBe("");
  });

  it("collapses cubic-metre variants to CUM", () => {
    expect(normalizeUom("cum")).toBe("CUM");
    expect(normalizeUom("CUM")).toBe("CUM");
    expect(normalizeUom("cu.m")).toBe("CUM"); // dots stripped → "cum"
    expect(normalizeUom("m3")).toBe("CUM");
    expect(normalizeUom("m³")).toBe("CUM");
  });

  it("collapses square-metre variants to SQM", () => {
    expect(normalizeUom("sqm")).toBe("SQM");
    expect(normalizeUom("m2")).toBe("SQM");
    expect(normalizeUom("sqft")).toBe("SQM");
  });

  it("maps count-like units to NOS", () => {
    expect(normalizeUom("nos")).toBe("NOS");
    expect(normalizeUom("No.")).toBe("NOS");
    expect(normalizeUom("each")).toBe("NOS");
  });

  it("maps single-letter litre alias", () => {
    expect(normalizeUom("l")).toBe("LTR");
  });

  it("does prefix fuzzy match for variants >= 3 chars", () => {
    // "cubicmeter" is a variant; "cubicmeters" should prefix-match it.
    expect(normalizeUom("cubicmeters")).toBe("CUM");
  });

  it("uppercases unknown units rather than dropping them", () => {
    expect(normalizeUom("widget")).toBe("WIDGET");
    // Quirk: the unknown-unit fallback uppercases the ORIGINAL raw value
    // (trimmed only) — dots/spaces are NOT stripped, unlike the lookup key.
    expect(normalizeUom(" sq.yard ")).toBe("SQ.YARD");
  });
});

describe("isKnownUom", () => {
  it("is true for a recognised unit and false for an unknown one", () => {
    expect(isKnownUom("cum")).toBe(true);
    expect(isKnownUom("widget")).toBe(false);
  });
});

describe("CANONICAL_UOMS", () => {
  it("contains the canonical keys", () => {
    expect(CANONICAL_UOMS.has("CUM")).toBe(true);
    expect(CANONICAL_UOMS.has("NOS")).toBe(true);
    expect(CANONICAL_UOMS.has("WIDGET")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { computeGstAmounts, resolveGstSplit } from "@/lib/services/products/gst";

describe("resolveGstSplit", () => {
  it("splits intra-state GST into CGST and SGST halves", () => {
    const split = resolveGstSplit({ gstRate: 18, interstate: false });
    expect(split.cgstRate).toBe(9);
    expect(split.sgstRate).toBe(9);
    expect(split.igstRate).toBe(0);
  });

  it("uses IGST for interstate", () => {
    const split = resolveGstSplit({ gstRate: 18, interstate: true });
    expect(split.igstRate).toBe(18);
    expect(split.cgstRate).toBe(0);
    expect(split.sgstRate).toBe(0);
  });

  it("respects explicit CGST/SGST overrides", () => {
    const split = resolveGstSplit({ gstRate: 18, cgstRate: 6, sgstRate: 12 });
    expect(split.cgstRate).toBe(6);
    expect(split.sgstRate).toBe(12);
  });
});

describe("computeGstAmounts", () => {
  it("computes CGST and SGST amounts on taxable base", () => {
    const amounts = computeGstAmounts({ taxableAmount: 1000, gstRate: 18, interstate: false });
    expect(amounts.cgstAmount).toBe(90);
    expect(amounts.sgstAmount).toBe(90);
    expect(amounts.igstAmount).toBe(0);
  });

  it("computes IGST for interstate", () => {
    const amounts = computeGstAmounts({ taxableAmount: 1000, gstRate: 18, interstate: true });
    expect(amounts.igstAmount).toBe(180);
    expect(amounts.cgstAmount).toBe(0);
  });
});

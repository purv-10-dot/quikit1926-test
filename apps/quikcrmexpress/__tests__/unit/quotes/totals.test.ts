import { describe, expect, it } from "vitest";
import { computeQuoteTotals, decideIntraState } from "@/lib/services/quotes/totals";

describe("decideIntraState", () => {
  it("returns true when both states match (case + whitespace insensitive)", () => {
    expect(decideIntraState("Karnataka", "karnataka")).toBe(true);
    expect(decideIntraState(" Karnataka ", "Karnataka")).toBe(true);
  });

  it("returns false on mismatch", () => {
    expect(decideIntraState("Karnataka", "Maharashtra")).toBe(false);
  });

  it("returns false when either side is missing (conservative IGST)", () => {
    expect(decideIntraState(null, "Karnataka")).toBe(false);
    expect(decideIntraState("Karnataka", null)).toBe(false);
    expect(decideIntraState(undefined, undefined)).toBe(false);
  });
});

describe("computeQuoteTotals — single line, intra-state", () => {
  const result = computeQuoteTotals({
    lines: [
      { quantity: 1, unitPrice: 1000, discountPct: 0, gstRate: 18 },
    ],
    intraState: true,
  });

  it("subtotal == taxable amount when no discount", () => {
    expect(result.subtotal).toBe(1000);
    expect(result.taxableAmount).toBe(1000);
  });

  it("splits 18% GST as 9% CGST + 9% SGST", () => {
    expect(result.cgstAmount).toBe(90);
    expect(result.sgstAmount).toBe(90);
    expect(result.igstAmount).toBe(0);
  });

  it("sums to grand total 1180", () => {
    expect(result.grandTotal).toBe(1180);
  });
});

describe("computeQuoteTotals — single line, inter-state", () => {
  const result = computeQuoteTotals({
    lines: [
      { quantity: 1, unitPrice: 1000, discountPct: 0, gstRate: 18 },
    ],
    intraState: false,
  });

  it("charges full GST as IGST", () => {
    expect(result.cgstAmount).toBe(0);
    expect(result.sgstAmount).toBe(0);
    expect(result.igstAmount).toBe(180);
    expect(result.grandTotal).toBe(1180);
  });
});

describe("computeQuoteTotals — line-level discount", () => {
  const result = computeQuoteTotals({
    lines: [
      { quantity: 10, unitPrice: 100, discountPct: 10, gstRate: 18 },
    ],
    intraState: false,
  });

  it("reduces taxable by the line discount before GST", () => {
    expect(result.subtotal).toBe(1000);
    expect(result.totalLineDiscount).toBe(100);
    expect(result.taxableAmount).toBe(900);
    expect(result.igstAmount).toBe(162);
    expect(result.grandTotal).toBe(1062);
  });
});

describe("computeQuoteTotals — mixed GST rates", () => {
  const result = computeQuoteTotals({
    lines: [
      { quantity: 1, unitPrice: 1000, discountPct: 0, gstRate: 5 },
      { quantity: 1, unitPrice: 1000, discountPct: 0, gstRate: 18 },
      { quantity: 1, unitPrice: 1000, discountPct: 0, gstRate: 28 },
    ],
    intraState: false,
  });

  it("computes each line's GST independently and sums them", () => {
    expect(result.subtotal).toBe(3000);
    // 50 + 180 + 280
    expect(result.igstAmount).toBe(510);
    expect(result.grandTotal).toBe(3510);
  });

  it("returns three computed line entries with their own GST", () => {
    expect(result.lines).toHaveLength(3);
    expect(result.lines[0]!.igstAmount).toBe(50);
    expect(result.lines[1]!.igstAmount).toBe(180);
    expect(result.lines[2]!.igstAmount).toBe(280);
  });
});

describe("computeQuoteTotals — overall discount (flat amount)", () => {
  const result = computeQuoteTotals({
    lines: [
      { quantity: 1, unitPrice: 2000, discountPct: 0, gstRate: 18 },
    ],
    overallDiscount: 200,
    intraState: false,
  });

  it("subtracts overall discount before GST", () => {
    expect(result.overallDiscountAmount).toBe(200);
    expect(result.taxableAmount).toBe(1800);
    // 18% of 1800 = 324
    expect(result.igstAmount).toBe(324);
    expect(result.grandTotal).toBe(2124);
  });
});

describe("computeQuoteTotals — overall discount (percentage)", () => {
  const result = computeQuoteTotals({
    lines: [
      { quantity: 1, unitPrice: 2000, discountPct: 0, gstRate: 18 },
    ],
    overallDiscount: 10,
    overallDiscountIsPct: true,
    intraState: false,
  });

  it("applies 10% to the post-line-discount subtotal", () => {
    expect(result.overallDiscountAmount).toBe(200);
    expect(result.taxableAmount).toBe(1800);
    expect(result.grandTotal).toBe(2124);
  });
});

describe("computeQuoteTotals — freight + round-off", () => {
  const result = computeQuoteTotals({
    lines: [
      { quantity: 1, unitPrice: 100, discountPct: 0, gstRate: 18 },
    ],
    freightAmount: 50,
    intraState: true,
  });

  it("adds freight after GST", () => {
    // taxable 100 + cgst 9 + sgst 9 + freight 50 = 168
    expect(result.grandTotal).toBe(168);
    expect(result.freightAmount).toBe(50);
  });
});

describe("computeQuoteTotals — round-off to nearest rupee", () => {
  const result = computeQuoteTotals({
    lines: [
      { quantity: 3, unitPrice: 33.33, discountPct: 0, gstRate: 18 },
    ],
    intraState: false,
  });

  it("rounds grand total to a whole rupee and reports the diff", () => {
    expect(Number.isInteger(result.grandTotal)).toBe(true);
    // grand total should be close to 118 (99.99 * 1.18)
    expect(result.grandTotal).toBe(118);
  });
});

describe("computeQuoteTotals — grand total in words", () => {
  it("renders Indian numbering on the grand total", () => {
    const result = computeQuoteTotals({
      lines: [
        { quantity: 1, unitPrice: 5000000, discountPct: 0, gstRate: 0 },
      ],
      intraState: false,
    });
    expect(result.grandTotal).toBe(5000000);
    expect(result.grandTotalInWords).toBe("Fifty Lakh Rupees Only");
  });
});

describe("computeQuoteTotals — edge cases", () => {
  it("returns zero totals for empty line list", () => {
    const result = computeQuoteTotals({ lines: [], intraState: true });
    expect(result.subtotal).toBe(0);
    expect(result.taxableAmount).toBe(0);
    expect(result.grandTotal).toBe(0);
  });

  it("clamps negative quantities/prices to zero", () => {
    const result = computeQuoteTotals({
      lines: [
        { quantity: -5, unitPrice: -10, discountPct: -5, gstRate: -2 },
      ],
      intraState: false,
    });
    expect(result.subtotal).toBe(0);
    expect(result.grandTotal).toBe(0);
  });

  it("clamps overall discount to the post-line-discount subtotal", () => {
    const result = computeQuoteTotals({
      lines: [
        { quantity: 1, unitPrice: 100, discountPct: 0, gstRate: 0 },
      ],
      overallDiscount: 9999,
      intraState: false,
    });
    expect(result.overallDiscountAmount).toBe(100);
    expect(result.taxableAmount).toBe(0);
    expect(result.grandTotal).toBe(0);
  });
});

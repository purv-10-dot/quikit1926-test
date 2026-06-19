import { describe, it, expect } from "vitest";
import { computeRABill } from "@/lib/rab/compute";

// Pure money module — no mocks. Waterfall:
//   gross = Σ line.currentAmount (or explicit gross override)
//   retention/tds/gst = gross * rate / 100
//   totalDeductions = retention + tds + mobilisation + LD + labourCess + other  (NO GST)
//   netPayable = gross + gstTotal − totalDeductions
// Every value rounded to 2 dp (paise).

describe("computeRABill — gross derivation", () => {
  it("sums line currentAmounts into gross", () => {
    const r = computeRABill({
      lines: [{ currentAmount: 100 }, { currentAmount: 250.5 }, { currentAmount: 49.5 }],
    });
    expect(r.gross).toBe(400);
  });

  it("coerces string + null line amounts (garbage → 0)", () => {
    const r = computeRABill({
      lines: [
        { currentAmount: "100.25" },
        { currentAmount: null },
        { currentAmount: undefined },
        { currentAmount: "not-a-number" },
        { currentAmount: 99.75 },
      ],
    });
    expect(r.gross).toBe(200);
  });

  it("uses explicit gross over lines when both provided", () => {
    const r = computeRABill({ gross: 1000, lines: [{ currentAmount: 5 }] });
    expect(r.gross).toBe(1000);
  });

  it("treats gross=0 as a real override, not a fallback to lines", () => {
    const r = computeRABill({ gross: 0, lines: [{ currentAmount: 500 }] });
    // gross is 0 (the explicit override), since 0 !== undefined && !== null
    expect(r.gross).toBe(0);
  });

  it("defaults gross to 0 with no lines and no gross", () => {
    const r = computeRABill({});
    expect(r.gross).toBe(0);
    expect(r.netPayable).toBe(0);
    expect(r.totalDeductions).toBe(0);
  });
});

describe("computeRABill — deduction math", () => {
  it("computes retention + tds as percent of gross", () => {
    const r = computeRABill({ gross: 100000, retentionPercent: 5, tdsRate: 2 });
    expect(r.retentionAmount).toBe(5000);
    expect(r.tdsAmount).toBe(2000);
    expect(r.totalDeductions).toBe(7000);
    expect(r.gstTotal).toBe(0);
    expect(r.netPayable).toBe(93000);
  });

  it("sums fixed deductions (mobilisation, LD, labourCess, other) into totalDeductions", () => {
    const r = computeRABill({
      gross: 100000,
      mobilisationRecovery: 1000,
      liquidatedDamages: 500,
      labourCess: 250.5,
      otherDeductions: 100,
    });
    expect(r.totalDeductions).toBe(1850.5);
    expect(r.netPayable).toBe(100000 - 1850.5);
  });

  it("rounds each money value to paise (2dp)", () => {
    // 33333 * 1.5% = 499.995 -> 500.00 (toFixed(2) rounds half-up here)
    const r = computeRABill({ gross: 33333, retentionPercent: 1.5 });
    expect(r.retentionAmount).toBe(500);
  });
});

describe("computeRABill — GST (added back, never deducted)", () => {
  it("intra-state: CGST + SGST added to net, excluded from totalDeductions", () => {
    const r = computeRABill({ gross: 100000, cgstRate: 9, sgstRate: 9 });
    expect(r.cgstAmount).toBe(9000);
    expect(r.sgstAmount).toBe(9000);
    expect(r.igstAmount).toBe(0);
    expect(r.gstTotal).toBe(18000);
    expect(r.totalDeductions).toBe(0);
    expect(r.netPayable).toBe(118000);
  });

  it("inter-state: IGST added to net", () => {
    const r = computeRABill({ gross: 100000, igstRate: 18 });
    expect(r.igstAmount).toBe(18000);
    expect(r.gstTotal).toBe(18000);
    expect(r.netPayable).toBe(118000);
  });

  it("full waterfall: gross + GST − all deductions", () => {
    const r = computeRABill({
      gross: 100000,
      retentionPercent: 5, // 5000
      tdsRate: 2, // 2000
      cgstRate: 9, // 9000
      sgstRate: 9, // 9000
      mobilisationRecovery: 1000,
      liquidatedDamages: 500,
      labourCess: 250,
      otherDeductions: 100,
    });
    expect(r.gstTotal).toBe(18000);
    expect(r.totalDeductions).toBe(5000 + 2000 + 1000 + 500 + 250 + 100); // 8850
    expect(r.netPayable).toBe(100000 + 18000 - 8850); // 109150
  });
});

describe("computeRABill — edges", () => {
  it("handles all-zero rates (net == gross)", () => {
    const r = computeRABill({ gross: 12345.67 });
    expect(r.netPayable).toBe(12345.67);
    expect(r.totalDeductions).toBe(0);
    expect(r.gstTotal).toBe(0);
  });

  it("allows net to go negative when deductions exceed gross", () => {
    const r = computeRABill({ gross: 1000, retentionPercent: 200 });
    expect(r.retentionAmount).toBe(2000);
    expect(r.netPayable).toBe(-1000);
  });

  it("echoes the rate inputs back on the result", () => {
    const r = computeRABill({
      gross: 100,
      retentionPercent: 5,
      tdsRate: 2,
      cgstRate: 9,
      sgstRate: 9,
      igstRate: 0,
    });
    expect(r.retentionPercent).toBe(5);
    expect(r.tdsRate).toBe(2);
    expect(r.cgstRate).toBe(9);
    expect(r.sgstRate).toBe(9);
    expect(r.igstRate).toBe(0);
  });

  it("coerces string rate inputs", () => {
    const r = computeRABill({ gross: "100000" as any, retentionPercent: "5" as any });
    expect(r.gross).toBe(100000);
    expect(r.retentionAmount).toBe(5000);
  });
});

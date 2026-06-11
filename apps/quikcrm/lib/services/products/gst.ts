/**
 * India GST split helper — used by quotes/orders and product master.
 */

export interface GstSplitRates {
  gstRate: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  interstate: boolean;
}

export function resolveGstSplit(input: {
  gstRate: number;
  cgstRate?: number | null;
  sgstRate?: number | null;
  igstRate?: number | null;
  interstate?: boolean;
}): GstSplitRates {
  const gstRate = round2(input.gstRate);
  const interstate = input.interstate ?? false;

  if (interstate) {
    const igstRate =
      input.igstRate != null ? round2(input.igstRate) : gstRate;
    return { gstRate, cgstRate: 0, sgstRate: 0, igstRate, interstate: true };
  }

  if (input.cgstRate != null && input.sgstRate != null) {
    return {
      gstRate,
      cgstRate: round2(input.cgstRate),
      sgstRate: round2(input.sgstRate),
      igstRate: 0,
      interstate: false,
    };
  }

  const half = round2(gstRate / 2);
  return { gstRate, cgstRate: half, sgstRate: half, igstRate: 0, interstate: false };
}

export function computeGstAmounts(input: {
  taxableAmount: number;
  gstRate: number;
  cgstRate?: number | null;
  sgstRate?: number | null;
  igstRate?: number | null;
  interstate?: boolean;
}): { cgstAmount: number; sgstAmount: number; igstAmount: number } {
  const split = resolveGstSplit(input);
  const base = input.taxableAmount;
  if (split.interstate) {
    return {
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: round2((base * split.igstRate) / 100),
    };
  }
  return {
    cgstAmount: round2((base * split.cgstRate) / 100),
    sgstAmount: round2((base * split.sgstRate) / 100),
    igstAmount: 0,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * GST + totals calculation engine.
 *
 * This is the *only* place quote totals are computed. Routes and the UI both
 * call into here so the math is guaranteed identical wherever it runs.
 *
 * Inputs are plain numbers (rupees). Outputs are rounded to two decimal
 * places to match the Decimal(18,2) DB columns. CGST/SGST/IGST are derived
 * from the GST rate plus the place-of-supply decision:
 *
 *   - same state (company == billing) → CGST + SGST, each = rate/2
 *   - different state                  → IGST = rate
 *
 * The total grand total is rounded to the nearest rupee; the round-off slice
 * is returned separately so the invoice PDF can print it on its own line.
 */

import { amountToWordsINR } from "./number-to-words";

export interface QuoteLineInput {
  quantity: number;
  unitPrice: number;
  discountPct: number;
  gstRate: number;
}

export interface QuoteTotalsInput {
  lines: QuoteLineInput[];
  /**
   * Overall discount applied AFTER per-line discounts and BEFORE freight/GST.
   * Pass either a percentage (use overallDiscountIsPct=true) or an absolute
   * rupee amount.
   */
  overallDiscount?: number;
  overallDiscountIsPct?: boolean;
  freightAmount?: number;
  /** Whether the company's state matches the customer's billing state. */
  intraState: boolean;
}

export interface ComputedLine {
  quantity: number;
  unitPrice: number;
  discountPct: number;
  discountAmount: number;
  taxableAmount: number;
  gstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  lineTotal: number;
}

export interface QuoteTotals {
  lines: ComputedLine[];
  subtotal: number;
  totalLineDiscount: number;
  overallDiscountAmount: number;
  freightAmount: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  roundOffAmount: number;
  grandTotal: number;
  grandTotalInWords: string;
}

/**
 * Round a number to two decimal places. Uses the banker's-rounding-free
 * `Math.round(x * 100) / 100` form which is good enough for INR (no fractional
 * paise) and matches what Decimal.toFixed(2) produces.
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeQuoteTotals(input: QuoteTotalsInput): QuoteTotals {
  const freight = round2(Math.max(0, input.freightAmount ?? 0));

  // Pass 1 — line-level subtotals + per-line discount.
  const linesAfterDiscount: Array<ComputedLine & { rawTaxable: number }> = input.lines.map(
    (l) => {
      const qty = Math.max(0, l.quantity);
      const price = Math.max(0, l.unitPrice);
      const discPct = Math.min(100, Math.max(0, l.discountPct));
      const rate = Math.max(0, l.gstRate);
      const gross = qty * price;
      const discountAmount = round2(gross * (discPct / 100));
      const rawTaxable = round2(gross - discountAmount);
      return {
        quantity: qty,
        unitPrice: round2(price),
        discountPct: discPct,
        discountAmount,
        taxableAmount: rawTaxable,
        rawTaxable,
        gstRate: rate,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
        lineTotal: 0,
      };
    },
  );

  const subtotal = round2(
    linesAfterDiscount.reduce((s, l) => s + (l.quantity * l.unitPrice), 0),
  );
  const totalLineDiscount = round2(
    linesAfterDiscount.reduce((s, l) => s + l.discountAmount, 0),
  );

  // Overall discount: percentage applies to (subtotal - lineDiscount); flat
  // amount is used as-is, clamped to non-negative.
  const postLineSubtotal = round2(subtotal - totalLineDiscount);
  const overallDiscountAmount = input.overallDiscountIsPct
    ? round2(postLineSubtotal * (Math.min(100, Math.max(0, input.overallDiscount ?? 0)) / 100))
    : round2(Math.max(0, Math.min(input.overallDiscount ?? 0, postLineSubtotal)));

  // Allocate the overall discount across lines pro-rata by their post-line
  // taxable amount so each line's GST stays internally consistent.
  const allocatable = postLineSubtotal;
  for (const l of linesAfterDiscount) {
    if (allocatable <= 0) {
      l.taxableAmount = 0;
    } else {
      const share = round2((l.rawTaxable / allocatable) * overallDiscountAmount);
      l.taxableAmount = round2(l.rawTaxable - share);
    }
  }

  // Pass 2 — GST per line.
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  for (const l of linesAfterDiscount) {
    if (input.intraState) {
      const half = round2(l.taxableAmount * (l.gstRate / 200));
      l.cgstAmount = half;
      l.sgstAmount = half;
      l.igstAmount = 0;
      cgst += half;
      sgst += half;
    } else {
      const full = round2(l.taxableAmount * (l.gstRate / 100));
      l.cgstAmount = 0;
      l.sgstAmount = 0;
      l.igstAmount = full;
      igst += full;
    }
    l.lineTotal = round2(l.taxableAmount + l.cgstAmount + l.sgstAmount + l.igstAmount);
  }

  const taxableAmount = round2(
    linesAfterDiscount.reduce((s, l) => s + l.taxableAmount, 0),
  );
  const cgstAmount = round2(cgst);
  const sgstAmount = round2(sgst);
  const igstAmount = round2(igst);

  const preRound = round2(
    taxableAmount + cgstAmount + sgstAmount + igstAmount + freight,
  );
  const grandTotal = Math.round(preRound);
  const roundOffAmount = round2(grandTotal - preRound);

  return {
    lines: linesAfterDiscount.map(({ rawTaxable: _r, ...rest }) => rest),
    subtotal,
    totalLineDiscount,
    overallDiscountAmount,
    freightAmount: freight,
    taxableAmount,
    cgstAmount,
    sgstAmount,
    igstAmount,
    roundOffAmount,
    grandTotal,
    grandTotalInWords: amountToWordsINR(grandTotal),
  };
}

/**
 * Convenience helper for routes: takes the company state + customer billing
 * state (both already snapshotted onto the quote) and returns the
 * intraState boolean used by computeQuoteTotals. Comparison is
 * case-insensitive + whitespace-tolerant so "Karnataka" / "karnataka" /
 * " Karnataka " all match.
 *
 * Either side missing → defaults to inter-state (IGST). This is the
 * conservative choice because charging IGST when the customer expected
 * CGST/SGST is recoverable via credit note; the reverse triggers a
 * compliance correction.
 */
export function decideIntraState(
  companyState: string | null | undefined,
  billingState: string | null | undefined,
): boolean {
  if (!companyState || !billingState) return false;
  return companyState.trim().toLowerCase() === billingState.trim().toLowerCase();
}

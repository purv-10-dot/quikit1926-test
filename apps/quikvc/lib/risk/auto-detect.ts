/**
 * Heuristic risk auto-detection from application financials.
 *
 * Pure rule-based — no AI. Cheap, deterministic, runs synchronously after
 * application submit. Anything fancier (cross-deal patterns, sector-aware
 * thresholds) is Sprint 4+.
 *
 * Each rule returns 0+ candidate signals. Caller is responsible for
 * persisting them to VCDealSignal with source="financial".
 */

export interface FinancialInputs {
  fundingAskLakhs: number;
  monthlyRevenueLakhs: number | null;
  ebitdaLakhs: number | null;
  existingDebtLakhs: number | null;
  loanType: string; // "term-loan" | "rbf" | "equity"
}

export interface DetectedSignal {
  severity: "red" | "amber" | "green";
  title: string;
  description: string;
}

export function detectFinancialSignals(inp: FinancialInputs): DetectedSignal[] {
  const out: DetectedSignal[] = [];

  // Rule 1: Funding ask is large vs revenue (>24 months runway implied).
  if (
    inp.monthlyRevenueLakhs != null &&
    inp.monthlyRevenueLakhs > 0 &&
    inp.fundingAskLakhs / inp.monthlyRevenueLakhs > 24
  ) {
    out.push({
      severity: "amber",
      title: "Funding ask large relative to revenue",
      description: `Ask of ₹${inp.fundingAskLakhs}L is ${Math.round(inp.fundingAskLakhs / inp.monthlyRevenueLakhs)}× monthly revenue. Probe how the proceeds drive ARR growth vs covering opex.`,
    });
  }

  // Rule 2: Negative EBITDA + term-loan ask.
  if (
    inp.loanType === "term-loan" &&
    inp.ebitdaLakhs != null &&
    inp.ebitdaLakhs < 0
  ) {
    out.push({
      severity: "red",
      title: "Negative EBITDA on a debt instrument",
      description: `EBITDA of ₹${inp.ebitdaLakhs}L doesn't service the proposed term loan. Either restructure to RBF/equity or wait for break-even.`,
    });
  }

  // Rule 3: High existing debt-to-revenue.
  if (
    inp.monthlyRevenueLakhs != null &&
    inp.monthlyRevenueLakhs > 0 &&
    inp.existingDebtLakhs != null &&
    inp.existingDebtLakhs / Math.max(inp.monthlyRevenueLakhs * 12, 1) > 1.5
  ) {
    out.push({
      severity: "amber",
      title: "Existing debt exceeds 1.5× annual revenue",
      description: `Existing debt of ₹${inp.existingDebtLakhs}L vs ₹${(inp.monthlyRevenueLakhs * 12).toFixed(0)}L annual revenue. Confirm DSCR room before adding more debt.`,
    });
  }

  // Rule 4: No revenue declared but seeking term loan.
  if (
    inp.loanType === "term-loan" &&
    (inp.monthlyRevenueLakhs == null || inp.monthlyRevenueLakhs === 0)
  ) {
    out.push({
      severity: "red",
      title: "Pre-revenue startup seeking term loan",
      description: `No monthly revenue declared. Term loan typically requires positive cash-flow; recommend equity or RBF instead.`,
    });
  }

  // Rule 5: Healthy cashflow signal — positive EBITDA + reasonable ask.
  if (
    inp.ebitdaLakhs != null &&
    inp.ebitdaLakhs > 0 &&
    inp.monthlyRevenueLakhs != null &&
    inp.fundingAskLakhs / inp.monthlyRevenueLakhs <= 12
  ) {
    out.push({
      severity: "green",
      title: "Positive operating cashflow",
      description: `EBITDA of ₹${inp.ebitdaLakhs}L/mo + ask within 12 months of revenue. Healthy unit economics for a debt instrument.`,
    });
  }

  return out;
}

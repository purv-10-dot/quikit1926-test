/**
 * RA Bill — amount computation (Phase 3).
 *
 * The single money path. Call computeRABill() from preview AND from create —
 * never re-derive amounts inside a route. Keeping one function guarantees the
 * preview a user approves is the exact bill that gets persisted.
 *
 * Waterfall:
 *
 *   gross            = Σ line.currentAmount        (the current bill amount)
 *   retentionAmount  = gross * retentionPercent / 100
 *   tdsAmount        = gross * tdsRate / 100
 *   GST (intra)      = CGST gross*cgstRate/100 + SGST gross*sgstRate/100
 *   GST (inter)      = IGST gross*igstRate/100
 *   totalDeductions  = retention + tds + mobilisation + LD + labourCess + other
 *   netPayable       = gross + GST − totalDeductions
 *
 * Rules:
 *   - Intra-state bills set cgstRate + sgstRate; inter-state set igstRate.
 *   - GST is ADDED to the bill; it is NOT part of totalDeductions.
 *   - Every money value is rounded to 2 dp (paise) at each step.
 */

export interface RABComputeLine {
  currentAmount: number | string | null | undefined;
}

export interface RABComputeInput {
  /** Lines whose currentAmount sums to gross. Ignored if `gross` is given. */
  lines?: RABComputeLine[] | null;
  /** Explicit gross override (use when lines aren't to hand). */
  gross?: number | string | null;

  retentionPercent?: number | string | null;
  tdsRate?: number | string | null;
  /** Intra-state GST. */
  cgstRate?: number | string | null;
  sgstRate?: number | string | null;
  /** Inter-state GST. */
  igstRate?: number | string | null;

  mobilisationRecovery?: number | string | null;
  liquidatedDamages?: number | string | null;
  labourCess?: number | string | null;
  otherDeductions?: number | string | null;
}

export interface RABComputeResult {
  gross: number;

  retentionPercent: number;
  retentionAmount: number;
  tdsRate: number;
  tdsAmount: number;

  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  gstTotal: number;

  mobilisationRecovery: number;
  liquidatedDamages: number;
  labourCess: number;
  otherDeductions: number;

  /** Sum of all deductions — excludes GST. */
  totalDeductions: number;
  netPayable: number;
}

/** Coerce to a finite number; null/undefined/garbage → 0. */
function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Round to paise (2 dp). */
function money(n: number): number {
  return Number(n.toFixed(2));
}

export function computeRABill(input: RABComputeInput): RABComputeResult {
  const gross = money(
    input.gross !== undefined && input.gross !== null
      ? num(input.gross)
      : (input.lines ?? []).reduce((s, l) => s + num(l.currentAmount), 0),
  );

  const retentionPercent = num(input.retentionPercent);
  const tdsRate = num(input.tdsRate);
  const cgstRate = num(input.cgstRate);
  const sgstRate = num(input.sgstRate);
  const igstRate = num(input.igstRate);

  const retentionAmount = money((gross * retentionPercent) / 100);
  const tdsAmount = money((gross * tdsRate) / 100);

  const cgstAmount = money((gross * cgstRate) / 100);
  const sgstAmount = money((gross * sgstRate) / 100);
  const igstAmount = money((gross * igstRate) / 100);
  const gstTotal = money(cgstAmount + sgstAmount + igstAmount);

  const mobilisationRecovery = money(num(input.mobilisationRecovery));
  const liquidatedDamages = money(num(input.liquidatedDamages));
  const labourCess = money(num(input.labourCess));
  const otherDeductions = money(num(input.otherDeductions));

  // GST is intentionally excluded — it is added back below, not deducted.
  const totalDeductions = money(
    retentionAmount +
      tdsAmount +
      mobilisationRecovery +
      liquidatedDamages +
      labourCess +
      otherDeductions,
  );

  const netPayable = money(gross + gstTotal - totalDeductions);

  return {
    gross,
    retentionPercent,
    retentionAmount,
    tdsRate,
    tdsAmount,
    cgstRate,
    cgstAmount,
    sgstRate,
    sgstAmount,
    igstRate,
    igstAmount,
    gstTotal,
    mobilisationRecovery,
    liquidatedDamages,
    labourCess,
    otherDeductions,
    totalDeductions,
    netPayable,
  };
}

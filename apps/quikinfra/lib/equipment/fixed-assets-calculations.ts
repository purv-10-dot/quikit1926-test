/** Client-safe fixed asset calculations — no server/db imports. */

export function computeAvailableQty(
  totalQty: number,
  issuedQty: number,
  underRepairQty: number,
  inTransitQty: number,
  lostQty: number,
): number {
  return Math.max(0, totalQty - issuedQty - underRepairQty - inTransitQty - lostQty);
}

export function computeBookValue(
  purchaseValue: number | null,
  accumulatedDepr: number | null,
): number {
  const cost = purchaseValue ?? 0;
  const depr = accumulatedDepr ?? 0;
  return Math.max(0, Math.round((cost - depr) * 100) / 100);
}

export function computeAnnualDepreciation(
  purchaseValue: number | null,
  accumulatedDepr: number | null,
  deprMethod: string | null,
  deprRate: number | null,
): number {
  const cost = purchaseValue ?? 0;
  const rate = deprRate ?? 0;
  if (cost <= 0 || rate <= 0) return 0;
  const accum = accumulatedDepr ?? 0;
  const base = (deprMethod ?? "SLM").toUpperCase() === "WDV" ? Math.max(0, cost - accum) : cost;
  return Math.round((base * rate) / 100 * 100) / 100;
}

export function computeAuditVariance(bookQty: number, countedQty: number): number {
  return Math.round((countedQty - bookQty) * 10000) / 10000;
}

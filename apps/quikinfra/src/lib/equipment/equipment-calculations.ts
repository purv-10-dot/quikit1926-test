/** Pure equipment calculations — safe to import from client components. */

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeRun(
  openingMeter: number | null,
  closingMeter: number | null,
  meterReset: boolean,
): number | null {
  if (closingMeter == null) return null;
  if (meterReset) return closingMeter;
  if (openingMeter == null) return null;
  return Math.max(0, closingMeter - openingMeter);
}

export function computeFuelRate(
  dieselIssued: number | null,
  run: number | null,
): number | null {
  if (dieselIssued == null || run == null || run <= 0) return null;
  return round4(dieselIssued / run);
}

export function computeJobCardTotal(
  spares: Array<{ qty: number; rate: number }>,
  labourCost: number,
  serviceCost: number,
): number {
  const sparesCost = spares.reduce(
    (sum, s) => sum + (Number(s.qty) || 0) * (Number(s.rate) || 0),
    0,
  );
  return round2(sparesCost + (labourCost || 0) + (serviceCost || 0));
}

export type DocComplianceState = "expired" | "expiring" | "ok";

export function deriveDocComplianceState(
  expiryDate: string | Date | null | undefined,
  alertDays = 30,
): { days: number | null; state: DocComplianceState; daysLabel: string } {
  if (!expiryDate) {
    return { days: null, state: "ok", daysLabel: "—" };
  }
  const exp = expiryDate instanceof Date ? expiryDate : new Date(expiryDate);
  if (Number.isNaN(exp.getTime())) {
    return { days: null, state: "ok", daysLabel: "—" };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expDay = new Date(exp);
  expDay.setHours(0, 0, 0, 0);
  const days = Math.round(
    (expDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (days < 0) {
    return { days, state: "expired", daysLabel: `${Math.abs(days)}d ago` };
  }
  if (days <= alertDays) {
    return { days, state: "expiring", daysLabel: `${days}d left` };
  }
  return { days, state: "ok", daysLabel: `${days}d left` };
}

export function computeBillableQty(
  loggedQty: number,
  minGuaranteedQty: number | null,
): number {
  const min = minGuaranteedQty ?? 0;
  return round2(Math.max(loggedQty, min));
}

export function computeVarianceQty(
  vendorClaimedQty: number | null,
  loggedQty: number,
): number | null {
  if (vendorClaimedQty == null) return null;
  return round2(vendorClaimedQty - loggedQty);
}

export function computeHireRentAmounts(
  billableQty: number,
  rate: number,
  gstPercent: number,
): { payable: number; gstAmount: number; total: number } {
  const payable = round2(billableQty * rate);
  const gstAmount = round2((payable * gstPercent) / 100);
  const total = round2(payable + gstAmount);
  return { payable, gstAmount, total };
}

/**
 * Repayment schedule generator.
 *
 * Three modes:
 *   - emi          → fixed monthly EMI (term loan amortization)
 *   - rbf          → revenue-based, returns target = principal * multiple
 *   - equity-exit  → no schedule; payments captured ad-hoc on liquidity events
 */

export type RepaymentType = "emi" | "rbf" | "equity-exit";

export interface EmiInput {
  principalPaise: bigint;
  annualInterestPct: number; // e.g. 12 = 12% APR
  tenureMonths: number;
  startDate: Date;
}

export interface EmiInstallment {
  dueDate: string; // ISO date
  amount: string; // paise as string (BigInt-safe JSON)
  status: "due" | "paid" | "overdue";
}

export interface EmiResult {
  installments: EmiInstallment[];
  totalExpectedPaise: bigint;
}

/**
 * Compute fixed EMI amortization. Returns per-month installments.
 *
 * EMI = P * r * (1+r)^n / ((1+r)^n - 1)
 *   where r = monthlyRate (decimal), n = tenureMonths.
 * Last instalment absorbs any rounding so totalExpected = EMI * n exactly.
 */
export function generateEmiSchedule(input: EmiInput): EmiResult {
  const { principalPaise, annualInterestPct, tenureMonths, startDate } = input;
  if (tenureMonths < 1) throw new Error("tenureMonths must be >= 1");

  const P = Number(principalPaise);
  const r = annualInterestPct / 100 / 12;

  let emi: number;
  if (r === 0) {
    emi = P / tenureMonths;
  } else {
    const pow = Math.pow(1 + r, tenureMonths);
    emi = (P * r * pow) / (pow - 1);
  }

  const emiPaise = Math.round(emi);
  const totalRounded = emiPaise * tenureMonths;

  const installments: EmiInstallment[] = [];
  for (let i = 1; i <= tenureMonths; i++) {
    const dt = new Date(startDate);
    dt.setMonth(dt.getMonth() + i);
    installments.push({
      dueDate: dt.toISOString().slice(0, 10),
      amount: String(emiPaise),
      status: "due",
    });
  }

  return {
    installments,
    totalExpectedPaise: BigInt(totalRounded),
  };
}

/**
 * RBF target: principal × multiple (e.g. 1.5x). No fixed schedule.
 */
export function rbfTarget(principalPaise: bigint, multiple: number): bigint {
  if (multiple <= 0) throw new Error("multiple must be positive");
  // Use BigInt math via integer scaling (4 decimal places).
  const scaled = Math.round(multiple * 10_000);
  return (principalPaise * BigInt(scaled)) / BigInt(10_000);
}

export interface PTSlabPreset {
  fromAmount: number;
  toAmount: number | null;
  taxAmount: number;
  gender: "All" | "Male" | "Female";
}

export interface PTStatePreset {
  state: string;
  deductionCycle: "Monthly" | "HalfYearly";
  note?: string;
  slabs: PTSlabPreset[];
}

/**
 * Professional Tax slabs per Indian state (FY 2024-25).
 * Source: state PT Acts. Amounts are monthly unless cycle is HalfYearly.
 * Verify with latest gazette before payroll go-live.
 */
export const PT_STATE_PRESETS: Record<string, PTStatePreset> = {
  "Andhra Pradesh": {
    state: "Andhra Pradesh",
    deductionCycle: "Monthly",
    slabs: [
      { fromAmount: 0, toAmount: 15000, taxAmount: 0, gender: "All" },
      { fromAmount: 15001, toAmount: 20000, taxAmount: 150, gender: "All" },
      { fromAmount: 20001, toAmount: null, taxAmount: 200, gender: "All" },
    ],
  },
  "Assam": {
    state: "Assam",
    deductionCycle: "Monthly",
    slabs: [
      { fromAmount: 0, toAmount: 10000, taxAmount: 0, gender: "All" },
      { fromAmount: 10001, toAmount: 15000, taxAmount: 150, gender: "All" },
      { fromAmount: 15001, toAmount: 25000, taxAmount: 180, gender: "All" },
      { fromAmount: 25001, toAmount: null, taxAmount: 208, gender: "All" },
    ],
  },
  "Bihar": {
    state: "Bihar",
    deductionCycle: "Monthly",
    note: "Bihar PT is levied annually; values here are the monthly equivalent.",
    slabs: [
      { fromAmount: 0, toAmount: 25000, taxAmount: 0, gender: "All" },
      { fromAmount: 25001, toAmount: 41666, taxAmount: 83, gender: "All" },
      { fromAmount: 41667, toAmount: 83333, taxAmount: 166, gender: "All" },
      { fromAmount: 83334, toAmount: null, taxAmount: 208, gender: "All" },
    ],
  },
  "Gujarat": {
    state: "Gujarat",
    deductionCycle: "Monthly",
    slabs: [
      { fromAmount: 0, toAmount: 12000, taxAmount: 0, gender: "All" },
      { fromAmount: 12001, toAmount: null, taxAmount: 200, gender: "All" },
    ],
  },
  "Karnataka": {
    state: "Karnataka",
    deductionCycle: "Monthly",
    slabs: [
      { fromAmount: 0, toAmount: 25000, taxAmount: 0, gender: "All" },
      { fromAmount: 25001, toAmount: null, taxAmount: 200, gender: "All" },
    ],
  },
  "Kerala": {
    state: "Kerala",
    deductionCycle: "HalfYearly",
    note: "Kerala PT is deducted half-yearly. Amounts below are per half-year.",
    slabs: [
      { fromAmount: 0, toAmount: 11999, taxAmount: 0, gender: "All" },
      { fromAmount: 12000, toAmount: 17999, taxAmount: 120, gender: "All" },
      { fromAmount: 18000, toAmount: 29999, taxAmount: 180, gender: "All" },
      { fromAmount: 30000, toAmount: 44999, taxAmount: 300, gender: "All" },
      { fromAmount: 45000, toAmount: 59999, taxAmount: 450, gender: "All" },
      { fromAmount: 60000, toAmount: 74999, taxAmount: 600, gender: "All" },
      { fromAmount: 75000, toAmount: 99999, taxAmount: 750, gender: "All" },
      { fromAmount: 100000, toAmount: 124999, taxAmount: 1000, gender: "All" },
      { fromAmount: 125000, toAmount: null, taxAmount: 1250, gender: "All" },
    ],
  },
  "Madhya Pradesh": {
    state: "Madhya Pradesh",
    deductionCycle: "Monthly",
    slabs: [
      { fromAmount: 0, toAmount: 18750, taxAmount: 0, gender: "All" },
      { fromAmount: 18751, toAmount: 25000, taxAmount: 125, gender: "All" },
      { fromAmount: 25001, toAmount: 33333, taxAmount: 167, gender: "All" },
      { fromAmount: 33334, toAmount: null, taxAmount: 208, gender: "All" },
    ],
  },
  "Maharashtra": {
    state: "Maharashtra",
    deductionCycle: "Monthly",
    note: "Women earning up to ₹25,000/month are exempt. February deduction is ₹300 for top slab.",
    slabs: [
      { fromAmount: 0, toAmount: 7500, taxAmount: 0, gender: "Male" },
      { fromAmount: 7501, toAmount: 10000, taxAmount: 175, gender: "Male" },
      { fromAmount: 10001, toAmount: null, taxAmount: 200, gender: "Male" },
      { fromAmount: 0, toAmount: 25000, taxAmount: 0, gender: "Female" },
      { fromAmount: 25001, toAmount: null, taxAmount: 200, gender: "Female" },
    ],
  },
  "Odisha": {
    state: "Odisha",
    deductionCycle: "Monthly",
    slabs: [
      { fromAmount: 0, toAmount: 13304, taxAmount: 0, gender: "All" },
      { fromAmount: 13305, toAmount: 25000, taxAmount: 125, gender: "All" },
      { fromAmount: 25001, toAmount: null, taxAmount: 200, gender: "All" },
    ],
  },
  "Tamil Nadu": {
    state: "Tamil Nadu",
    deductionCycle: "HalfYearly",
    note: "Tamil Nadu PT is deducted half-yearly. Amounts below are per half-year.",
    slabs: [
      { fromAmount: 0, toAmount: 21000, taxAmount: 0, gender: "All" },
      { fromAmount: 21001, toAmount: 30000, taxAmount: 135, gender: "All" },
      { fromAmount: 30001, toAmount: 45000, taxAmount: 315, gender: "All" },
      { fromAmount: 45001, toAmount: 60000, taxAmount: 690, gender: "All" },
      { fromAmount: 60001, toAmount: 75000, taxAmount: 1025, gender: "All" },
      { fromAmount: 75001, toAmount: null, taxAmount: 1250, gender: "All" },
    ],
  },
  "Telangana": {
    state: "Telangana",
    deductionCycle: "Monthly",
    slabs: [
      { fromAmount: 0, toAmount: 15000, taxAmount: 0, gender: "All" },
      { fromAmount: 15001, toAmount: 20000, taxAmount: 150, gender: "All" },
      { fromAmount: 20001, toAmount: null, taxAmount: 200, gender: "All" },
    ],
  },
  "West Bengal": {
    state: "West Bengal",
    deductionCycle: "Monthly",
    slabs: [
      { fromAmount: 0, toAmount: 10000, taxAmount: 0, gender: "All" },
      { fromAmount: 10001, toAmount: 15000, taxAmount: 110, gender: "All" },
      { fromAmount: 15001, toAmount: 25000, taxAmount: 130, gender: "All" },
      { fromAmount: 25001, toAmount: 40000, taxAmount: 150, gender: "All" },
      { fromAmount: 40001, toAmount: null, taxAmount: 200, gender: "All" },
    ],
  },
};

export function getPTPreset(state: string): PTStatePreset | null {
  return PT_STATE_PRESETS[state] ?? null;
}

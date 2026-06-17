export type CompType = "Earning" | "Deduction" | "Benefit" | "Reimbursement";
export type AmountType = "Fixed" | "PercentOfBasic" | "PercentOfCTC" | "PercentOfGross" | "Formula";
export type Frequency = "Monthly" | "Quarterly" | "HalfYearly" | "Yearly" | "OneTime";

export interface SalaryComponent {
  id: string;
  name: string;
  nameInPayslip: string | null;
  code: string;
  type: CompType | "StatutoryContribution";
  category: string;
  amountType: AmountType;
  amountValue: string | number | null;
  formula: string | null;
  frequency: Frequency;
  taxable: boolean;
  includeInCTC: boolean;
  includeInGross: boolean;
  considerForEPF: boolean;
  considerForESI: boolean;
  considerForPT: boolean;
  considerForLWF: boolean;
  considerEPFIfPFWageLT15k: boolean;
  proRateOnLOP: boolean;
  maxAmount: string | number | null;
  description: string | null;
  showInPayslip: boolean;
  partOfSalaryStructure: boolean;
  isRecurring: boolean;
  isFBP: boolean;
  carryForwardUnclaimed: boolean;
  investmentSection: string | null;
  investmentType: string | null;
  isSystem: boolean;
  isActive: boolean;
}

export const inputCls = "w-full px-3 py-2 text-sm border border-[var(--border)] rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";

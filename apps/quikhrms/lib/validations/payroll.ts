import { z } from "zod";
import { PAN_REGEX, TAN_REGEX, ESI_REGEX } from "./identifiers";

// "" / null → undefined so optional regex fields don't trip in Zod 4.
// Cast preserves inferred string type (preprocess output otherwise typed `unknown`).
function optStr<T extends z.ZodString>(schema: T): z.ZodOptional<T> {
  return z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    schema.optional(),
  ) as unknown as z.ZodOptional<T>;
}

// ─── Tax Details ────────────────────────────────────────

export const updateTaxDetailsSchema = z.object({
  pan: z.string().regex(PAN_REGEX, "Invalid PAN. Format: 5 letters + 4 digits + 1 letter (e.g. ABCDE1234F)"),
  tan: optStr(z.string().regex(TAN_REGEX, "Invalid TAN. Format: 4 letters + 5 digits + 1 letter (e.g. BLRB00012A)")),
  tdsCircleCodeArea:  optStr(z.string().max(3)),
  tdsCircleCodeType:  optStr(z.string().max(2)),
  tdsCircleNumber:    optStr(z.string().max(3)),
  tdsCircleSubNumber: optStr(z.string().max(2)),
  taxPaymentFrequency: z.enum(["Monthly", "Quarterly"]).optional(),
  deductorType: z.enum(["Employee", "NonEmployee"]),
  deductorEmployeeId: z.string().optional().nullable(),
  deductorName: z.string().min(1, "Authorized signatory name is required"),
  deductorFatherName: z.string().min(1, "Authorized signatory father name is required"),
  deductorAddress: z.string().min(1, "Address is required"),
  deductorDesignation: z.string().min(1, "Designation is required"),
});

// ─── Pay Schedule ───────────────────────────────────────

export const WorkDayEnum = z.enum([
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
]);

export const updatePayScheduleSchema = z.object({
  workWeek: z.array(WorkDayEnum).min(1, "At least one work day"),
  salaryCalcBasis: z.enum(["ActualDaysInMonth", "OrganisationWorkingDays"]),
  orgWorkingDays: z.number().int().min(1).max(31).optional().nullable(),
  payDayType: z.enum(["LastWorkingDay", "FixedDay"]),
  payDayOfMonth: z.number().int().min(1).max(31).optional().nullable(),
  payFrequency: z.enum(["Monthly", "SemiMonthly", "BiWeekly", "Weekly"]).default("Monthly"),
  firstPayrollMonth: z.string().optional().nullable(),
}).refine(
  (v) => v.salaryCalcBasis !== "OrganisationWorkingDays" || !!v.orgWorkingDays,
  { path: ["orgWorkingDays"], message: "Required when calc basis is OrganisationWorkingDays" },
).refine(
  (v) => v.payDayType !== "FixedDay" || !!v.payDayOfMonth,
  { path: ["payDayOfMonth"], message: "Required when pay day type is FixedDay" },
);

// ─── Statutory: EPF ─────────────────────────────────────

export const updateEPFSchema = z.object({
  enabled: z.boolean(),
  epfNumber: z.string().min(1, "EPF number is required"),
  deductionCycle: z.enum(["Monthly"]).default("Monthly"),
  employeeContributionRate: z.enum(["TwelvePercentActual", "TwelvePercentRestricted"]),
  employerContributionRate: z.enum(["TwelvePercentActual", "TwelvePercentRestricted"]),
  includeEmployerInCTC: z.boolean().default(true),
  includeEDLIInCTC: z.boolean().default(false),
  includeAdminChargesInCTC: z.boolean().default(false),
  allowOverrideAtEmployee: z.boolean().default(false),
  proRateRestrictedWage: z.boolean().default(false),
  considerAllComponentsOnLOP: z.boolean().default(true),
});

// ─── Statutory: ESI ─────────────────────────────────────

export const updateESISchema = z.object({
  enabled: z.boolean(),
  esiNumber: z.string()
    .min(1, "ESI Employer Code is required")
    .regex(ESI_REGEX, "ESI Employer Code must be 17 digits — compact or grouped (XX-XX-XXXXXX-XXX-XXXX)"),
  deductionCycle: z.enum(["Monthly"]).default("Monthly"),
  // Statutory rates — locked. Any user-supplied value is overwritten with constants.
  employeeContributionPercent: z.number().min(0).max(100).optional().transform(() => 0.75),
  employerContributionPercent: z.number().min(0).max(100).optional().transform(() => 3.25),
  includeEmployerInCTC: z.boolean().default(false),
  grossCeiling: z.number().int("Gross ceiling must be whole rupees").min(1, "Must be greater than 0").max(1_000_000, "Unrealistic value"),
});

// ─── Statutory: Professional Tax ────────────────────────

export const ptSlabSchema = z.object({
  fromAmount: z.number().min(0),
  toAmount: z.number().min(0).nullable().optional(),
  taxAmount: z.number().min(0),
  gender: z.enum(["All", "Male", "Female"]).default("All"),
}).refine(
  (d) => d.toAmount == null || d.toAmount >= d.fromAmount,
  { message: "Slab upper amount must be greater than or equal to the lower amount", path: ["toAmount"] },
);

export const upsertPTSchema = z.object({
  enabled: z.boolean(),
  locationId: z.string().optional().nullable(),
  state: z.string().min(1, "State is required"),
  ptNumber: z.string().min(1, "PT number is required"),
  deductionCycle: z.enum(["Monthly", "HalfYearly"]).default("Monthly"),
  slabs: z.array(ptSlabSchema).min(1, "At least one tax slab is required"),
});

// ─── Statutory: LWF ─────────────────────────────────────

export const upsertLWFSchema = z
  .object({
    enabled: z.boolean(),
    state: z.string().min(1),
    calcType: z.enum(["Flat", "PercentOfWage"]).default("Flat"),
    employeeContribution: z.number().min(0).default(0),
    employerContribution: z.number().min(0).default(0),
    employeeRate: z.number().min(0).max(100).optional().nullable(),
    employerRate: z.number().min(0).max(100).optional().nullable(),
    employeeCap: z.number().min(0).optional().nullable(),
    employerCap: z.number().min(0).optional().nullable(),
    deductionCycle: z.enum(["Monthly", "Quarterly", "HalfYearly", "Yearly"]),
  })
  // Force employer = 2× employee on every save, regardless of what client sent.
  .transform((v) => ({
    ...v,
    employerContribution: v.employeeContribution * 2,
    employerRate: v.employeeRate != null ? v.employeeRate * 2 : null,
    employerCap: v.employeeCap != null ? v.employeeCap * 2 : null,
  }))
  .refine(
    (v) =>
      v.calcType !== "PercentOfWage" ||
      (v.employeeRate != null && v.employeeCap != null),
    {
      path: ["employeeRate"],
      message: "Employee rate + cap are required when calcType is PercentOfWage",
    },
  );

// ─── Statutory: State Minimum Wage ──────────────────────

export const upsertStateMinWageSchema = z.object({
  state: z.string().min(1, "State required"),
  scheduledEmployment: z.string().optional().nullable(),
  skillLevel: z.enum(["Unskilled", "SemiSkilled", "Skilled", "HighlySkilled"]).optional().nullable(),
  zone: z.string().optional().nullable(),
  monthlyWage: z.number().min(0),
  effectiveFrom: z.string(),
  notes: z.string().optional().nullable(),
});

// ─── Statutory: Bonus ───────────────────────────────────

export const updateBonusSchema = z.object({
  enabled: z.boolean(),
  // Statutory min/max — locked. Any user value is overwritten with constants.
  minPercent: z.number().min(0).max(100).optional().transform(() => 8.33),
  maxPercent: z.number().min(0).max(100).optional().transform(() => 20),
  eligibilityWageCap: z.number().min(0).default(21000),
  calculationWageCap: z.number().min(0).default(7000),
  payoutFrequency: z.enum(["Monthly", "Quarterly", "HalfYearly", "Yearly", "OneTime"]).default("Yearly"),
});

// ─── Salary Component ───────────────────────────────────

export const SalaryComponentTypeEnum = z.enum(["Earning", "Deduction", "Reimbursement", "Benefit", "StatutoryContribution"]);

export const SalaryComponentCategoryEnum = z.enum([
  "Basic", "HRA", "DA", "ConveyanceAllowance", "MedicalAllowance", "SpecialAllowance",
  "ChildrenEducationAllowance", "TransportAllowance", "TravellingAllowance", "FixedAllowance",
  "Bonus", "Overtime", "Incentive", "Commission", "LeaveEncashment", "NoticePay", "HoldSalary",
  "Gratuity", "VoluntaryProvidentFund",
  "EPFEmployee", "EPFEmployer", "ESIEmployee", "ESIEmployer", "ProfessionalTax", "LabourWelfareFund",
  "IncomeTax", "LoanDeduction", "LOPDeduction", "WithheldSalary", "NoticePayDeduction",
  "FuelReimbursement", "DriverReimbursement", "VehicleMaintenanceReimbursement",
  "TelephoneReimbursement", "LeaveTravelAllowance",
  "OtherEarning", "OtherDeduction", "OtherReimbursement", "OtherBenefit",
]);

export const salaryComponentSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1).max(32),
  type: SalaryComponentTypeEnum,
  category: SalaryComponentCategoryEnum,
  amountType: z.enum(["Fixed", "PercentOfBasic", "PercentOfCTC", "PercentOfGross", "Formula"]),
  amountValue: z.preprocess((v) => v === "" || v == null ? null : Number(v), z.number().nullable().optional()),
  formula: z.string().nullable().optional(),
  frequency: z.enum(["Monthly", "Quarterly", "HalfYearly", "Yearly", "OneTime"]).default("Monthly"),
  taxable: z.boolean().default(true),
  includeInCTC: z.boolean().default(true),
  includeInGross: z.boolean().default(true),
  considerForEPF: z.boolean().default(false),
  considerForESI: z.boolean().default(false),
  considerForPT: z.boolean().default(false),
  considerForLWF: z.boolean().default(false),
  considerEPFIfPFWageLT15k: z.boolean().default(false),
  proRateOnLOP: z.boolean().default(true),
  maxAmount: z.preprocess((v) => v === "" || v == null ? null : Number(v), z.number().nullable().optional()),
  description: z.string().nullable().optional(),
  nameInPayslip: z.string().nullable().optional(),
  showInPayslip: z.boolean().default(true),
  partOfSalaryStructure: z.boolean().default(true),
  isRecurring: z.boolean().default(true),
  isFBP: z.boolean().default(false),
  carryForwardUnclaimed: z.boolean().default(true),
  requireBillNumber: z.boolean().default(false),
  requireMerchantName: z.boolean().default(false),
  requireUploadDoc: z.boolean().default(false),
  claimInstructions: z.string().max(2000).optional().nullable(),
  investmentSection: z.string().nullable().optional(),
  investmentType: z.string().nullable().optional(),
  correctionForId: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
});

export const updateSalaryComponentSchema = salaryComponentSchema.partial();

// ─── Salary Structure (Template) ────────────────────────

export const salaryStructureComponentSchema = z.object({
  componentId: z.string().min(1),
  amountType: z.enum(["Fixed", "PercentOfBasic", "PercentOfCTC", "PercentOfGross", "Formula"]),
  amountValue: z.preprocess((v) => v === "" || v == null ? null : Number(v), z.number().nullable().optional()),
  formula: z.string().nullable().optional(),
  sortOrder: z.number().int().default(0),
});

const salaryStructureBase = z.object({
  name: z.string().min(1),
  code: z.string().min(1).max(32),
  description: z.string().nullable().optional(),
  ctcMin: z.number().nullable().optional(),
  ctcMax: z.number().nullable().optional(),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  components: z.array(salaryStructureComponentSchema).default([]),
});

const ctcRangeCheck = (d: { ctcMin?: number | null; ctcMax?: number | null }, ctx: z.RefinementCtx) => {
  if (d.ctcMin != null && d.ctcMax != null && d.ctcMin > d.ctcMax) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Min CTC can’t be greater than max CTC", path: ["ctcMax"] });
  }
};

export const salaryStructureSchema = salaryStructureBase.superRefine(ctcRangeCheck);

export const updateSalaryStructureSchema = salaryStructureBase.partial().superRefine(ctcRangeCheck);

// ─── Employee Salary Assignment ─────────────────────────

export const assignEmployeeSalarySchema = z.object({
  employeeId: z.string().min(1),
  structureId: z.string().min(1),
  ctc: z.number().positive(),
  effectiveFrom: z.string().min(1),
  revisionReason: z.string().optional().nullable(),
});

export const bulkAssignEmployeeSalarySchema = z.object({
  assignments: z.array(assignEmployeeSalarySchema).min(1).max(500),
});

// ─── Pay Run ────────────────────────────────────────────

export const createPayRunSchema = z.object({
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  payDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  legalEntityId: z.string().optional().nullable(),
  payFrequency: z.enum(["Monthly", "SemiMonthly", "BiWeekly", "Weekly"]).optional(),
});

export const updatePayRunSchema = z.object({
  payDate: z.string().optional(),
  notes: z.string().optional().nullable(),
});

// HR-side manual override of paid days for a single payslip in a run.
// Compute reads this back on every recompute so the override persists.
export const adjustPayslipDaysSchema = z.object({
  paidDays: z.number().min(0, "Paid days cannot be negative"),
  reason: z.string().max(500).optional().nullable(),
});

// HR-side manual override of TDS (income tax) for a single payslip + recovery plan
// for the resulting deficit (or excess).
export const adjustPayslipTdsSchema = z.object({
  overrideTds: z.number().min(0, "TDS cannot be negative"),
  strategy: z.enum(["NextMonth", "SpreadOverMonths"]),
  // For "NextMonth" this is always 1; for "Spread", the requested N. The server
  // caps N to months remaining in the FY (1..11), inclusive of next month.
  recoveryMonths: z.number().int().min(1).max(11).optional(),
  reason: z.string().max(500).optional().nullable(),
});

// ─── Prior Payroll ──────────────────────────────────────

// ─── Loans ──────────────────────────────────────────────

export const LoanTypeEnum = z.enum(["Personal", "Education", "Medical", "Housing", "Vehicle", "Advance", "Other"]);

const loanBase = z.object({
  employeeId: z.string().min(1),
  loanType: LoanTypeEnum.default("Personal"),
  principalAmount: z.number().positive(),
  interestRate: z.number().min(0).max(100).default(0),
  tenureMonths: z.number().int().min(1).max(360),
  emiAmount: z.number().positive(),
  startDate: z.string().min(1),
  reason: z.string().optional().nullable(),
});

const loanChecks = (d: { principalAmount?: number; emiAmount?: number; tenureMonths?: number }, ctx: z.RefinementCtx) => {
  if (d.emiAmount != null && d.principalAmount != null && d.emiAmount > d.principalAmount) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "EMI can’t exceed the loan principal", path: ["emiAmount"] });
  }
  // Total EMIs must at least repay the principal (interest makes real total higher).
  if (d.emiAmount != null && d.tenureMonths != null && d.principalAmount != null && d.emiAmount * d.tenureMonths < d.principalAmount) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "EMI × tenure must be at least the principal — increase EMI or tenure", path: ["emiAmount"] });
  }
};

export const createLoanSchema = loanBase.superRefine(loanChecks);

export const updateLoanSchema = loanBase.partial().superRefine(loanChecks);

export const rejectLoanSchema = z.object({
  rejectionReason: z.string().min(1),
});

export const disburseLoanSchema = z.object({
  disbursementDate: z.string().min(1),
});

// Lump-sum prepayment (partial or full early payoff) against a disbursed loan.
export const prepayLoanSchema = z.object({
  amount: z.number().positive(),
  note: z.string().max(500).optional().nullable(),
});

// Forgive 1-3 EMI installments (write-off the equivalent outstanding).
export const waiveLoanSchema = z.object({
  emiCount: z.number().int().min(1).max(3),
  note: z.string().max(500).optional().nullable(),
});

// Pause EMI auto-deduction for 1-3 months; auto-resumes after holdUntil.
export const holdLoanSchema = z.object({
  months: z.number().int().min(1).max(3),
  note: z.string().max(500).optional().nullable(),
});

// ─── Donations (80G) ────────────────────────────────────

export const createDonationSchema = z.object({
  employeeId: z.string().min(1),
  financialYear: z.string().min(1),
  donorPAN: z.string().optional().nullable(),
  doneeName: z.string().min(1),
  doneePAN: z.string().optional().nullable(),
  section: z.string().default("80G"),
  donationDate: z.string().min(1),
  amount: z.number().positive(),
  exemptionPercent: z.number().min(0).max(100).default(100),
  qualifyingLimit: z.number().optional().nullable(),
  receiptNumber: z.string().optional().nullable(),
  fileUrl: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const verifyDonationSchema = z.object({
  status: z.enum(["Verified", "Rejected"]),
  rejectionReason: z.string().optional().nullable(),
});

// ─── Reimbursement Claim ────────────────────────────────

export const createReimbursementClaimSchema = z.object({
  employeeId: z.string().min(1),
  componentId: z.string().optional().nullable(),
  componentName: z.string().min(1),
  billDate: z.string().min(1),
  billNumber: z.string().optional().nullable(),
  amountClaimed: z.number().positive(),
  fileUrl: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
});

// Single uploaded attachment on a reimbursement claim.
const claimAttachmentSchema = z.object({
  url: z.string().min(1),
  name: z.string().min(1),
  size: z.number().int().nonnegative(),
  type: z.string().min(1),
  uploadedAt: z.string().min(1),
});

export const employeeSubmitClaimSchema = z.object({
  // EITHER `componentId` (legacy FBP path — points to a SalaryComponent row)
  // OR `category` (new Reimbursement path — free-text label like "Fuel",
  // "Telephone", "Travel"). One of the two must be present.
  componentId: z.string().min(1).optional().nullable(),
  category: z.string().min(1).max(100).optional().nullable(),
  title: z.string().max(200).optional().nullable(),
  billDate: z.string().min(1, "Bill date is required"),
  billDateTo: z.string().optional().nullable(),
  billNumber: z.string().optional().nullable(),
  merchantName: z.string().max(200).optional().nullable(),
  currency: z.string().min(3).max(8).optional().nullable(),
  isProject: z.boolean().optional(),
  amountClaimed: z.number().positive("Amount must be positive"),
  fileUrl: z.string().optional().nullable(),
  // Multi-file attachments — cap 10 per claim. Primary file (fileUrl) is
  // derived from attachments[0] when this is non-empty.
  attachments: z.array(claimAttachmentSchema).max(10).optional().nullable(),
  description: z.string().optional().nullable(),
}).refine(
  (v) => !!(v.componentId?.trim() || v.category?.trim()),
  { path: ["category"], message: "Pick a category or component" },
).refine(
  (v) => !v.billDateTo || v.billDateTo >= v.billDate,
  { path: ["billDateTo"], message: "Bill end date must be on or after the bill date" },
);

// ─── One-Time Earning (Bonus / Arrears / Incentive) ────

export const ONE_TIME_KIND = ["Bonus", "Arrears", "Incentive", "Commission", "PerformanceBonus", "ReferralBonus", "Other", "Deduction"] as const;
export const ONE_TIME_CATEGORY = [
  "Bonus", "Incentive", "Commission", "OtherEarning",
  "OtherDeduction", "LoanDeduction", "NoticePayDeduction",
] as const;

export const createOneTimeEarningSchema = z.object({
  employeeId: z.string().min(1),
  kind: z.enum(ONE_TIME_KIND),
  category: z.enum(ONE_TIME_CATEGORY).default("OtherEarning"),
  componentCode: z.string().min(1).max(64),
  componentName: z.string().min(1).max(128),
  amount: z.number().positive(),
  payPeriod: z.string().min(1, "Pay period (YYYY-MM-01) required"),
  taxable: z.boolean().default(true),
  considerForEPF: z.boolean().default(false),
  considerForESI: z.boolean().default(true),
  considerForPT: z.boolean().default(true),
  reason: z.string().optional().nullable(),
});

// Bulk import row — uses employeeCode (human-friendly) instead of employeeId,
// the API resolves the code to an id before insert.
export const bulkOneTimeEarningRowSchema = z.object({
  employeeCode: z.string().min(1),
  kind: z.enum(ONE_TIME_KIND),
  category: z.enum(ONE_TIME_CATEGORY).default("OtherEarning"),
  componentCode: z.string().min(1).max(64),
  componentName: z.string().min(1).max(128),
  amount: z.number().positive(),
  payPeriod: z.string().min(1),
  taxable: z.boolean().default(true),
  considerForEPF: z.boolean().default(false),
  considerForESI: z.boolean().default(true),
  considerForPT: z.boolean().default(true),
  reason: z.string().optional().nullable(),
});
export const bulkOneTimeEarningSchema = z.object({
  rows: z.array(bulkOneTimeEarningRowSchema).min(1).max(1000),
});

// ─── Legal Entity ───────────────────────────────────────

export const upsertLegalEntitySchema = z.object({
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(255),
  registeredName: z.string().optional().nullable(),
  pan: z.string().optional().nullable(),
  tan: z.string().optional().nullable(),
  gstin: z.string().optional().nullable(),
  cin: z.string().optional().nullable(),
  country: z.string().min(2).max(3).default("IN"),
  currency: z.string().min(3).max(3).default("INR"),
  state: z.string().optional().nullable(),
  addressLine1: z.string().optional().nullable(),
  addressLine2: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  pincode: z.string().optional().nullable(),
  pfEstablishmentCode: z.string().optional().nullable(),
  esiEstablishmentCode: z.string().optional().nullable(),
  ptRegistrationNumber: z.string().optional().nullable(),
  lwfRegistrationNumber: z.string().optional().nullable(),
  status: z.enum(["Active", "Inactive"]).default("Active"),
  isPrimary: z.boolean().default(false),
  notes: z.string().optional().nullable(),
});

// ─── Pay Run Approval Chain ────────────────────────────

export const setupApprovalChainSchema = z.object({
  approvers: z.array(z.object({
    level: z.number().int().min(1).max(10),
    approverId: z.string().min(1),
    approverRole: z.string().optional().nullable(),
  })).min(1).max(10),
});

export const actApprovalSchema = z.object({
  status: z.enum(["Approved", "Rejected"]),
  comments: z.string().optional().nullable(),
});

// ─── Full & Final ───────────────────────────────────────

export const createFNFSchema = z.object({
  employeeId: z.string().min(1),
  resignationDate: z.string().min(1),
  lastWorkingDate: z.string().min(1),
  reason: z.string().optional().nullable(),
});

export const updateFNFSchema = z.object({
  pendingSalary: z.number().min(0).optional(),
  leaveEncashment: z.number().min(0).optional(),
  gratuityAmount: z.number().min(0).optional(),
  bonusAmount: z.number().min(0).optional(),
  noticePayRecovery: z.number().min(0).optional(),
  loanRecovery: z.number().min(0).optional(),
  otherEarnings: z.number().min(0).optional(),
  otherDeductions: z.number().min(0).optional(),
  tdsDeducted: z.number().min(0).optional(),
  status: z.enum(["Draft", "Computed", "Approved", "Paid", "Cancelled"]).optional(),
  notes: z.string().optional().nullable(),
});

// ─── Form 12BB ─────────────────────────────────────────

// Supporting evidence file shape. URL comes from POST /api/v1/hrms/uploads.
const form12BBDocSchema = z.object({
  url: z.string().min(1),
  name: z.string().min(1),
  size: z.number().int().nonnegative(),
  type: z.string().min(1),
  label: z.string().max(200).optional().nullable(),
  uploadedAt: z.string().min(1),
});

export const form12BBDocumentsSchema = z.object({
  hra:        z.array(form12BBDocSchema).max(20).optional(),
  lta:        z.array(form12BBDocSchema).max(20).optional(),
  homeLoan:   z.array(form12BBDocSchema).max(20).optional(),
  chapterVIA: z.array(form12BBDocSchema).max(50).optional(),
}).strict();

// Mandatory-evidence rules per IT Rule 26C + Form 12BB. Enforced both
// server-side (here, via superRefine) and client-side (mirror function in the
// Form12BB page) so the user gets fast feedback but cannot bypass with curl.
const HRA_PAN_RENT_THRESHOLD = 100000;

export const upsertForm12BBSchema = z.object({
  financialYear: z.string().min(1),

  hraClaimed: z.boolean().default(false),
  rentPaid: z.number().min(0).default(0),
  landlordName: z.string().optional().nullable(),
  landlordPan: z.string().optional().nullable(),
  landlordAddress: z.string().optional().nullable(),

  ltaClaimed: z.boolean().default(false),
  ltaAmount: z.number().min(0).default(0),
  ltaDetails: z.string().optional().nullable(),

  // Home loan — Lender Address + Type added per official Form 12BB row 3
  homeLoanInterest: z.number().min(0).default(0),
  lenderName: z.string().optional().nullable(),
  lenderPan: z.string().optional().nullable(),
  lenderAddress: z.string().optional().nullable(),
  lenderType: z.enum(["FinancialInstitution", "Employer", "Other"]).optional().nullable(),

  // Chapter VI-A — 80CCC + 80CCD(1) added per official row 4(A)(ii)/(iii)
  section80C: z.number().min(0).default(0),
  section80CCC: z.number().min(0).default(0),
  section80CCD1: z.number().min(0).default(0),
  section80D: z.number().min(0).default(0),
  section80E: z.number().min(0).default(0),
  section80G: z.number().min(0).default(0),
  section80TTA: z.number().min(0).default(0),
  nps80CCD1B: z.number().min(0).default(0),
  otherDeductions: z.record(z.string(), z.number().min(0)).optional().nullable(),

  // Verification block
  verificationPlace: z.string().optional().nullable(),
  verificationDate: z.string().optional().nullable(),
  verificationName: z.string().optional().nullable(),
  verificationDesignation: z.string().optional().nullable(),

  signedFileUrl: z.string().optional().nullable(),

  // Supporting evidence — one bucket per Form 12BB row
  documents: form12BBDocumentsSchema.optional().nullable(),
}).superRefine((v, ctx) => {
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });

  // ── Verification block — required for every submission ──
  if (!v.verificationName?.trim())        issue(["verificationName"], "Full name is required to verify the declaration");
  if (!v.verificationDesignation?.trim()) issue(["verificationDesignation"], "Designation is required");
  if (!v.verificationPlace?.trim())       issue(["verificationPlace"], "Place is required");
  if (!v.verificationDate?.trim())        issue(["verificationDate"], "Date is required");

  // ── Signed declaration — Form 12BB is a sworn declaration ──
  if (!v.signedFileUrl?.trim()) {
    issue(["signedFileUrl"], "Upload a signed, scanned Form 12BB before submitting");
  }

  // ── HRA (Row 1) — only when claimed ──
  if (v.hraClaimed) {
    if (!(v.rentPaid > 0))             issue(["rentPaid"], "Annual rent paid is required when claiming HRA");
    if (!v.landlordName?.trim())       issue(["landlordName"], "Landlord name is required");
    if (!v.landlordAddress?.trim())    issue(["landlordAddress"], "Landlord address is required");
    if (v.rentPaid > HRA_PAN_RENT_THRESHOLD && !v.landlordPan?.trim()) {
      issue(["landlordPan"], `Landlord PAN is mandatory when annual rent exceeds ₹${HRA_PAN_RENT_THRESHOLD.toLocaleString("en-IN")}`);
    }
    if (!v.documents?.hra || v.documents.hra.length === 0) {
      issue(["documents", "hra"], "Attach at least one supporting document (rent agreement or receipt)");
    }
  }

  // ── LTA (Row 2) — only when claimed ──
  if (v.ltaClaimed) {
    if (!(v.ltaAmount > 0))   issue(["ltaAmount"], "LTA amount is required when claiming LTA");
    if (!v.documents?.lta || v.documents.lta.length === 0) {
      issue(["documents", "lta"], "Attach at least one travel proof (ticket or boarding pass)");
    }
  }

  // ── Home loan interest (Row 3) — only when amount > 0 ──
  if (v.homeLoanInterest > 0) {
    if (!v.lenderName?.trim())   issue(["lenderName"], "Lender name is required when claiming home loan interest");
    if (!v.lenderAddress?.trim()) issue(["lenderAddress"], "Lender address is required");
    if (!v.lenderType)           issue(["lenderType"], "Lender type is required");
    if (v.lenderType === "FinancialInstitution" && !v.lenderPan?.trim()) {
      issue(["lenderPan"], "Lender PAN is mandatory for financial institutions");
    }
    if (!v.documents?.homeLoan || v.documents.homeLoan.length === 0) {
      issue(["documents", "homeLoan"], "Attach the lender's provisional interest certificate");
    }
  }

  // ── Chapter VI-A (Row 4) — proof required when any sub-section claimed ──
  const chapterVIAClaim =
    v.section80C + v.section80CCC + v.section80CCD1 +
    v.section80D + v.section80E + v.section80G +
    v.section80TTA + v.nps80CCD1B;
  if (chapterVIAClaim > 0) {
    if (!v.documents?.chapterVIA || v.documents.chapterVIA.length === 0) {
      issue(["documents", "chapterVIA"], "Attach at least one investment proof for the Chapter VI-A deductions claimed");
    }
  }
});

// Legacy TDS Challan schema (createTDSChallanSchema) was removed when the
// old TDSChallan model retired. Use createTdsChallanSchema (further down)
// which targets the v2 TdsChallan model with allocations.

export const upsertEmailTemplateSchema = z.object({
  key: z.string().min(1).max(64),
  channel: z.enum(["Email", "InApp"]).default("Email"),
  subject: z.string().min(1).max(255),
  body: z.string().min(1),
  enabled: z.boolean().default(true),
  description: z.string().optional().nullable(),
});

export const approveOneTimeEarningSchema = z.object({
  status: z.enum(["Approved", "Rejected"]),
  rejectionReason: z.string().optional().nullable(),
}).refine((v) => v.status !== "Rejected" || (v.rejectionReason && v.rejectionReason.length > 0), {
  path: ["rejectionReason"],
  message: "Rejection reason required when rejecting",
});

export const approveReimbursementClaimSchema = z.object({
  amountApproved: z.number().positive(),
  remarks: z.string().optional().nullable(),
});

export const rejectReimbursementClaimSchema = z.object({
  rejectionReason: z.string().min(1),
});

// ─── Investment Proof ───────────────────────────────────

export const createInvestmentProofSchema = z.object({
  employeeId: z.string().min(1),
  financialYear: z.string().min(1),
  section: z.string().min(1),
  investmentType: z.string().min(1),
  declaredAmount: z.number().min(0),
  proofAmount: z.number().min(0),
  fileUrl: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
});

export const reviewInvestmentProofSchema = z.object({
  approvedAmount: z.number().min(0),
  status: z.enum(["Approved", "PartiallyApproved", "Rejected", "UnderReview"]),
  rejectionReason: z.string().optional().nullable(),
});

// ─── Salary Revision ────────────────────────────────────

export const createSalaryRevisionSchema = z.object({
  employeeId: z.string().min(1),
  proposedCTC: z.number().positive(),
  structureId: z.string().optional().nullable(),
  effectiveFrom: z.string().min(1),
  reason: z.string().optional().nullable(),
});

export const rejectSalaryRevisionSchema = z.object({
  rejectionReason: z.string().min(1),
});

// ─── Claims & Declarations ──────────────────────────────

export const updateClaimsDeclarationSchema = z.object({
  itDeclarationReleased: z.boolean().optional(),
  poiReleased: z.boolean().optional(),
  poiStartMonth: z.number().int().min(1).max(12).optional(),
  allowRegimeSwitch: z.boolean().optional(),
  allowTDSModification: z.boolean().optional(),
  allowTDSModificationPayroll: z.boolean().optional(),
  defaultRegime: z.enum(["OldRegime", "NewRegime"]).optional(),
});

export const priorPayrollRecordSchema = z.object({
  employeeId: z.string().min(1),
  financialYear: z.string().min(1),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  grossEarnings: z.number().min(0).default(0),
  totalDeductions: z.number().min(0).default(0),
  netPay: z.number().min(0).default(0),
  epfEmployee: z.number().min(0).default(0),
  epfEmployer: z.number().min(0).default(0),
  esiEmployee: z.number().min(0).default(0),
  esiEmployer: z.number().min(0).default(0),
  professionalTax: z.number().min(0).default(0),
  tds: z.number().min(0).default(0),
  notes: z.string().optional().nullable(),
});

export const bulkPriorPayrollSchema = z.object({
  records: z.array(priorPayrollRecordSchema).min(1).max(5000),
});

export const updatePriorPayrollSchema = z.object({
  enabled: z.boolean(),
  financialYear: z.string().optional().nullable(),
  fromMonth: z.string().optional().nullable(),
  toMonth: z.string().optional().nullable(),
  dataUploaded: z.boolean().optional(),
  notes: z.string().optional().nullable(),
}).refine(
  (v) => !v.enabled || !!(v.financialYear && v.financialYear.trim()),
  { path: ["financialYear"], message: "Financial year is required" },
).refine(
  (v) => !v.enabled || !!(v.fromMonth && v.fromMonth.trim()),
  { path: ["fromMonth"], message: "From month is required" },
).refine(
  (v) => !v.enabled || !!(v.toMonth && v.toMonth.trim()),
  { path: ["toMonth"], message: "To month is required" },
);

// ─── TDS v2 — Challan + Reconciliation ─────────────────────────

const BSR_REGEX = /^\d{7}$/;
const PAN_TAN_TAN_REGEX = /^[A-Z]{4}\d{5}[A-Z]$/; // TAN format

export const TDS_PAYMENT_MODE = ["OnlineITNS", "NEFT", "RTGS", "Cheque"] as const;

export const allocationSplitSchema = z.object({
  periodYear: z.number().int().min(2000).max(2100),
  periodMonth: z.number().int().min(1).max(12),
  amount: z.number().positive(),
  natureOfPayment: z.string().default("92B"),
});

export const createTdsChallanSchema = z.object({
  cin: z.string().min(8).max(64),
  bsrCode: z.string().regex(BSR_REGEX, "BSR code must be exactly 7 digits"),
  challanSerial: z.string().min(1).max(20),
  depositDate: z.string().min(1),
  natureOfPayment: z.string().default("92B"),
  tanNumber: z.string().regex(PAN_TAN_TAN_REGEX, "TAN format invalid (e.g. ABCD12345E)"),

  basicTax: z.number().min(0),
  surcharge: z.number().min(0).default(0),
  educationCess: z.number().min(0).default(0),
  interest: z.number().min(0).default(0),
  lateFee: z.number().min(0).default(0),
  others: z.number().min(0).default(0),
  totalAmount: z.number().positive(),

  paymentMode: z.enum(TDS_PAYMENT_MODE),
  bankName: z.string().optional().nullable(),
  acknowledgmentNumber: z.string().optional().nullable(),

  // If omitted, the server auto-allocates to the period that matches
  // (depositDate's previous month). For explicit splits, pass an array.
  allocations: z.array(allocationSplitSchema).optional(),
}).refine(
  (v) => {
    const sum = v.basicTax + v.surcharge + v.educationCess + v.interest + v.lateFee + v.others;
    return Math.abs(sum - v.totalAmount) < 0.01;
  },
  { path: ["totalAmount"], message: "Total must equal sum of components" },
).refine(
  (v) => !v.allocations || Math.abs(v.allocations.reduce((s, a) => s + a.amount, 0) - v.basicTax) < 0.01,
  { path: ["allocations"], message: "Allocation total must equal Basic Tax" },
);

export const reallocateTdsChallanSchema = z.object({
  allocations: z.array(allocationSplitSchema).min(1),
});

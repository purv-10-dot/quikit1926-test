// Canonical tax / statutory flags for each One-Time-Earning kind.
//
// These are SERVER-AUTHORITATIVE — the create + bulk endpoints ignore any
// flag values from the client body and always apply these defaults so the
// same kind is treated consistently across employees and reports
// (Form 16, 24Q, EPF return, ESI return).
//
// References:
//   • Bonus / Performance Bonus — excluded from EPF wage definition (EPF Act
//     §2(b)). Included in ESI gross + PT wage if within ceiling.
//   • Arrears — deferred Basic, so all four stat apply (EPF, ESI, PT, tax).
//   • Incentive / Commission — variable pay outside basic; not EPF, but ESI/PT
//     since they hit gross.
//   • Referral Bonus — one-off, NOT regular wage; excluded from all stat.
//   • Deduction — flags don't apply (it's negative pay, treated by category).

export type OneTimeKind =
  | "Bonus"
  | "Arrears"
  | "Incentive"
  | "Commission"
  | "PerformanceBonus"
  | "ReferralBonus"
  | "Other"
  | "Deduction";

export interface OneTimeStatutoryFlags {
  taxable: boolean;
  considerForEPF: boolean;
  considerForESI: boolean;
  considerForPT: boolean;
}

const FLAGS: Record<OneTimeKind, OneTimeStatutoryFlags> = {
  Bonus:            { taxable: true,  considerForEPF: false, considerForESI: true,  considerForPT: true  },
  Arrears:          { taxable: true,  considerForEPF: true,  considerForESI: true,  considerForPT: true  },
  Incentive:        { taxable: true,  considerForEPF: false, considerForESI: true,  considerForPT: true  },
  Commission:       { taxable: true,  considerForEPF: false, considerForESI: true,  considerForPT: true  },
  PerformanceBonus: { taxable: true,  considerForEPF: false, considerForESI: true,  considerForPT: true  },
  ReferralBonus:    { taxable: true,  considerForEPF: false, considerForESI: false, considerForPT: false },
  Other:            { taxable: true,  considerForEPF: false, considerForESI: true,  considerForPT: true  },
  // Deduction: flags don't matter (negative pay routed via category), but
  // returned anyway so the type stays uniform — taxable=false because
  // deductions shouldn't be added to taxable income.
  Deduction:        { taxable: false, considerForEPF: false, considerForESI: false, considerForPT: false },
};

/**
 * Tenant-aware version. Looks up per-tenant overrides in
 * OneTimeStatutoryDefault; falls back to the hardcoded FLAGS table for any
 * kind that has no row. Pass the kind once or batch-fetch a whole map.
 */
export async function defaultsForKindForTenant(
  orgId: string,
  kind: OneTimeKind,
): Promise<OneTimeStatutoryFlags> {
  // Local import keeps this module usable in places that only need the
  // hardcoded fallback (e.g. UI rendering before fetching).
  const { prisma } = await import("@/lib/prisma");
  const row = await prisma.oneTimeStatutoryDefault.findUnique({
    where: { orgId_kind: { orgId, kind } },
    select: { taxable: true, considerForEPF: true, considerForESI: true, considerForPT: true },
  });
  return row ?? FLAGS[kind];
}

export const KIND_ORDER: OneTimeKind[] = [
  "Bonus", "Arrears", "Incentive", "Commission",
  "PerformanceBonus", "ReferralBonus", "Other", "Deduction",
];

export const HARDCODED_DEFAULTS = FLAGS;

import type { CrmAccount } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";

export type AccountImportRowInput = {
  orgId: string;
  name: string;
  ownerName?: string | null;
  industry?: string | null;
  website?: string | null;
  city?: string | null;
  state?: string | null;
  countryCode?: string | null;
  postalCode?: string | null;
  status?: string | null;
  segment?: string | null;
  annualRevenueDisplay?: string | null;
  annualRevenueCurrency?: string | null;
  contractStart?: string | null;
  contractEnd?: string | null;
  renewalDate?: string | null;
  npsScore?: string | null;
};

/** Upsert an account row by name (name + orgId dedup). */
export async function upsertImportedAccountRow(
  data: AccountImportRowInput,
): Promise<CrmAccount> {
  const existing = await prisma.crmAccount.findFirst({
    where: { orgId: data.orgId, name: data.name, deletedAt: null },
  });

  const payload = {
    ownerName: data.ownerName || null,
    industry: data.industry || null,
    website: data.website || null,
    city: data.city || null,
    state: data.state || null,
    countryCode: data.countryCode || null,
    postalCode: data.postalCode || null,
    status: data.status || null,
    segment: data.segment || null,
    annualRevenueDisplay: data.annualRevenueDisplay || null,
    annualRevenueCurrency: data.annualRevenueCurrency || null,
    contractStart: data.contractStart ? new Date(data.contractStart) : null,
    contractEnd: data.contractEnd ? new Date(data.contractEnd) : null,
    renewalDate: data.renewalDate ? new Date(data.renewalDate) : null,
    npsScore: data.npsScore ? parseInt(data.npsScore, 10) : null,
  };

  if (existing) {
    return prisma.crmAccount.update({
      where: { id: existing.id },
      data: payload,
    });
  }

  return prisma.crmAccount.create({
    data: {
      orgId: data.orgId,
      name: data.name,
      ...payload,
    },
  });
}

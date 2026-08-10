import { db } from "@/lib/db";
import type { Prisma } from "@quikit/database";

export interface QuoteApprovalRules {
  maxDiscountPctWithoutApproval: number;
  minAmountForApproval: number;
  minMarginPct: number;
}

export interface QuoteCpqRule {
  id: string;
  whenProductId: string;
  suggestProductIds: string[];
  label: string;
}

export interface QuoteEnterpriseSettings {
  approval: QuoteApprovalRules;
  cpqRules: QuoteCpqRule[];
  reminderDaysBeforeExpiry: number;
}

const DEFAULTS: QuoteEnterpriseSettings = {
  approval: {
    maxDiscountPctWithoutApproval: 15,
    minAmountForApproval: 500_000,
    minMarginPct: 10,
  },
  cpqRules: [],
  reminderDaysBeforeExpiry: 3,
};

export async function getQuoteEnterpriseSettings(
  tenantId: string,
): Promise<QuoteEnterpriseSettings> {
  const row = await db.crmOrgWorkspaceSettings.findUnique({
    where: { tenantId },
    select: { settings: true },
  });
  const raw = row?.settings as Record<string, unknown> | undefined;
  const quotes = raw?.quotesEnterprise as Partial<QuoteEnterpriseSettings> | undefined;
  if (!quotes) return DEFAULTS;
  return {
    approval: { ...DEFAULTS.approval, ...quotes.approval },
    cpqRules: Array.isArray(quotes.cpqRules) ? quotes.cpqRules : [],
    reminderDaysBeforeExpiry:
      typeof quotes.reminderDaysBeforeExpiry === "number"
        ? quotes.reminderDaysBeforeExpiry
        : DEFAULTS.reminderDaysBeforeExpiry,
  };
}

export async function saveQuoteEnterpriseSettings(
  tenantId: string,
  patch: Partial<QuoteEnterpriseSettings>,
): Promise<QuoteEnterpriseSettings> {
  const current = await getQuoteEnterpriseSettings(tenantId);
  const next: QuoteEnterpriseSettings = {
    approval: { ...current.approval, ...patch.approval },
    cpqRules: patch.cpqRules ?? current.cpqRules,
    reminderDaysBeforeExpiry:
      patch.reminderDaysBeforeExpiry ?? current.reminderDaysBeforeExpiry,
  };
  const row = await db.crmOrgWorkspaceSettings.findUnique({
    where: { tenantId },
    select: { settings: true },
  });
  const settings = (row?.settings as Record<string, unknown> | undefined) ?? {};
  const merged = { ...settings, quotesEnterprise: next } as unknown as Prisma.InputJsonValue;
  await db.crmOrgWorkspaceSettings.upsert({
    where: { tenantId },
    create: { tenantId, settings: merged },
    update: { settings: merged },
  });
  return next;
}

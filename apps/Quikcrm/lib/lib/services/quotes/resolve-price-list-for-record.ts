import type { Prisma } from "@quikit/database";
import { db } from "@/lib/db";

type DbClient = typeof db | Prisma.TransactionClient;

/**
 * Resolve the price list for quoting: explicit opportunity list → account default → tenant default.
 */
export async function resolvePriceListIdForQuote(args: {
  orgId: string;
  accountId: string;
  opportunityId?: string | null;
  explicitPriceListId?: string | null;
  client?: DbClient;
}): Promise<string | null> {
  if (args.explicitPriceListId) return args.explicitPriceListId;
  const client = args.client ?? db;

  if (args.opportunityId) {
    const opp = await client.crmOpportunity.findFirst({
      where: { id: args.opportunityId, orgId: args.orgId },
      select: { priceListId: true, accountId: true },
    });
    if (opp?.priceListId) return opp.priceListId;
  }

  const account = await client.crmAccount.findFirst({
    where: { id: args.accountId, orgId: args.orgId },
    select: { defaultPriceListId: true },
  });
  if (account?.defaultPriceListId) return account.defaultPriceListId;

  const tenantDefault = await client.crmPriceList.findFirst({
    where: { orgId: args.orgId, isDefault: true, deletedAt: null, isActive: true },
    select: { id: true },
  });
  return tenantDefault?.id ?? null;
}

export async function resolveOpportunityPriceListId(args: {
  orgId: string;
  accountId?: string | null;
  explicitPriceListId?: string | null;
  client?: DbClient;
}): Promise<string | null> {
  if (args.explicitPriceListId) return args.explicitPriceListId;
  if (!args.accountId) return null;
  const client = args.client ?? db;
  const account = await client.crmAccount.findFirst({
    where: { id: args.accountId, orgId: args.orgId },
    select: { defaultPriceListId: true },
  });
  return account?.defaultPriceListId ?? null;
}

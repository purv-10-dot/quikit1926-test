import { requireUser } from "@/lib/auth/require";
import { getEffectiveMatrix } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shared/page-header";
import { PageContainer } from "@/components/ui/container";
import {
  PriceListsListClient,
  type PriceListsStats,
} from "@/components/quotes/price-lists-list-client";

const ADMIN_ROLE = "Administrator";

/**
 * Server-side stats for the Price Lists page. Cheap: two count queries +
 * one lookup for the default-list name.
 */
async function computePriceListStats(orgId: string): Promise<PriceListsStats> {
  const activeListWhere = { orgId, deletedAt: null } as const;
  const [total, totalItems, defaultRow] = await Promise.all([
    db.qcePriceList.count({ where: activeListWhere }),
    // Count items on active price lists only (works before item-level deletedAt migration).
    db.qcePriceListItem.count({
      where: { orgId, priceList: { deletedAt: null } },
    }),
    db.qcePriceList.findFirst({
      where: { orgId, isDefault: true, deletedAt: null },
      select: { name: true },
    }),
  ]);
  return {
    total,
    totalItems,
    defaultName: defaultRow?.name ?? null,
  };
}

export default async function PriceListsPage() {
  const user = await requireUser();
  const isAdmin = user.role === ADMIN_ROLE;
  let canDelete = isAdmin;
  if (!isAdmin) {
    const matrix = await getEffectiveMatrix(user.userId, user.orgId, user.role);
    const row = matrix.find((r) => r.module === "quotes");
    canDelete = !!row?.actions.includes("delete");
  }

  const stats = await computePriceListStats(user.orgId);
  return (
    <PageContainer size="wide">
      <PageHeader
        title="Price Lists"
        subtitle="Named pricing tiers (Standard / Wholesale / Enterprise) used by quotes."
      />
      <PriceListsListClient
        initialStats={stats}
        canDelete={canDelete}
        isAdmin={isAdmin}
      />
    </PageContainer>
  );
}

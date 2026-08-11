import { requireUser } from "@/lib/auth/require";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shared/page-header";
import { PageContainer } from "@/components/ui/container";
import {
  ProductsListClient,
  type ProductsStats,
} from "@/components/quotes/products-list-client";

/**
 * Server-side stats for the Products list page. Computed once at render
 * time so the stats bar paints with the page (no flicker). Always
 * reflects ALL products in the tenant — the filters the client applies
 * (search, active/inactive) don't change these aggregate counts.
 */
async function computeProductStats(tenantId: string): Promise<ProductsStats> {
  const [total, active, categoryRows] = await Promise.all([
    db.crmProduct.count({ where: { tenantId } }),
    db.crmProduct.count({ where: { tenantId, isActive: true } }),
    db.crmProduct.findMany({
      where: { tenantId, category: { not: null } },
      select: { category: true },
      distinct: ["category"],
    }),
  ]);
  return {
    total,
    active,
    inactive: total - active,
    categories: categoryRows.length,
  };
}

export default async function ProductsPage() {
  const user = await requireUser();
  const stats = await computeProductStats(user.tenantId);
  return (
    <PageContainer size="wide">
      <PageHeader
        title="Products"
        subtitle="Catalog of sellable products and services. Used by the Quotes module."
      />
      <ProductsListClient initialStats={stats} />
    </PageContainer>
  );
}

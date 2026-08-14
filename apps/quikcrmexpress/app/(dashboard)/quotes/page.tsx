import { requireUser } from "@/lib/auth/require";
import { getEffectiveMatrix } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

const ADMIN_ROLE = "Administrator";
import { PageHeader } from "@/components/shared/page-header";
import { PageContainer } from "@/components/ui/container";
import { QuotesListClient, type QuotesStats } from "@/components/quotes/quotes-list-client";
import { QuotesAnalyticsDashboard } from "@/components/quotes/enterprise/quotes-analytics-dashboard";

/**
 * Server-side stats roll-up for the Quotes list page.
 *
 * Computed here (Server Component) so the stats bar renders on first paint
 * without an extra round-trip, and so the figures are universal — they
 * always reflect ALL quotes in the tenant, not just the currently-filtered
 * page. This matches how the Opportunities pipeline header behaves.
 *
 * Uses `groupBy` for the by-status counts + grand-total sums in a single
 * query. Cheap (`(orgId, status)` is indexed via `@@index([orgId, status])`
 * on QceQuote).
 */
async function computeQuoteStats(orgId: string): Promise<QuotesStats> {
  const grouped = await db.qceQuote.groupBy({
    by: ["status"],
    where: { orgId, deletedAt: null },
    _count: { _all: true },
    _sum: { grandTotal: true },
  });

  const stats: QuotesStats = {
    total: 0,
    byStatus: { Draft: 0, Active: 0, Won: 0, Lost: 0, Revised: 0 },
    activeGrandTotal: 0,
    wonGrandTotal: 0,
  };
  for (const row of grouped) {
    const count = row._count._all;
    stats.total += count;
    stats.byStatus[row.status] = count;
    const sum = Number(String(row._sum.grandTotal ?? 0));
    if (row.status === "Active") stats.activeGrandTotal = sum;
    if (row.status === "Won") stats.wonGrandTotal = sum;
  }
  return stats;
}

export default async function QuotesPage() {
  const user = await requireUser();
  const isAdmin = user.role === ADMIN_ROLE;
  let canDelete = isAdmin;
  if (!isAdmin) {
    const matrix = await getEffectiveMatrix(user.userId, user.orgId, user.role);
    const row = matrix.find((r) => r.module === "quotes");
    canDelete = !!row?.actions.includes("delete");
  }

  const stats = await computeQuoteStats(user.orgId);
  return (
    <PageContainer size="wide">
      <PageHeader
        title="Quotes"
        subtitle="Enterprise quoting — PDF, portal, approvals, CPQ, and analytics."
      />
      <QuotesListClient
        initialStats={stats}
        canDelete={canDelete}
        isAdmin={isAdmin}
      />
      <div className="mt-8">
        <QuotesAnalyticsDashboard />
      </div>
    </PageContainer>
  );
}

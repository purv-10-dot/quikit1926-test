import { ok, fail, errorMessage } from "@/lib/api/responses";
import { prisma } from "@/lib/prisma";
import { portalRoute } from "@/lib/portal/api";

export const dynamic = "force-dynamic";

const n = (x: unknown) => Number(x ?? 0);

/** Vendor portal dashboard — POs, bills and payment KPIs scoped to the vendor. */
export async function GET() {
  const guard = await portalRoute("vendor", "view");
  if (!guard.ok) return guard.response;
  const { orgId, contactId } = guard.context;
  if (!contactId) return ok({ noContact: true });

  try {
    const [pos, bills, recentPos] = await Promise.all([
      prisma.$queryRaw`SELECT COUNT(*) FILTER (WHERE COALESCE(status,'') NOT IN ('cancelled','billed','rejected'))::int AS open_pos, COUNT(*) FILTER (WHERE status = 'draft')::int AS pending FROM purchase_orders WHERE org_id = ${orgId}::uuid AND contact_id = ${contactId}::uuid`,
      prisma.$queryRaw`SELECT COUNT(*)::int AS submitted, COALESCE(SUM(balance_due),0) AS outstanding, COUNT(*) FILTER (WHERE balance_due > 0)::int AS unpaid FROM bills WHERE org_id = ${orgId}::uuid AND contact_id = ${contactId}::uuid`,
      prisma.$queryRaw`SELECT id, purchase_order_number, total, status, issue_date FROM purchase_orders WHERE org_id = ${orgId}::uuid AND contact_id = ${contactId}::uuid ORDER BY issue_date DESC NULLS LAST, created_at DESC LIMIT 5`
    ]) as [Array<{ open_pos: number; pending: number }>, Array<{ submitted: number; outstanding: string; unpaid: number }>, Array<Record<string, unknown>>];

    return ok({
      kpis: {
        openPos: pos[0]?.open_pos ?? 0,
        pendingDeliveries: pos[0]?.pending ?? 0,
        billsSubmitted: bills[0]?.submitted ?? 0,
        outstanding: n(bills[0]?.outstanding),
        unpaidBills: bills[0]?.unpaid ?? 0
      },
      recentPos
    });
  } catch (error) {
    return fail(500, { code: "VENDOR_DASHBOARD_FAILED", message: errorMessage(error) });
  }
}

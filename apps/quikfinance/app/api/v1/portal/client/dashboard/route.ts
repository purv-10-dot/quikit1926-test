import { ok, fail, errorMessage } from "@/lib/api/responses";
import { prisma } from "@/lib/prisma";
import { portalRoute } from "@/lib/portal/api";

export const dynamic = "force-dynamic";

const n = (x: unknown) => Number(x ?? 0);

/** Client portal dashboard — KPIs + recent activity, scoped to the customer. */
export async function GET() {
  const guard = await portalRoute("client", "view");
  if (!guard.ok) return guard.response;
  const { orgId, contactId } = guard.context;
  if (!contactId) return ok({ noContact: true });

  try {
    const [bal, inv, pay, quotes, orders] = await Promise.all([
      prisma.$queryRaw`SELECT COALESCE(SUM(balance_due),0) AS outstanding, COUNT(*) FILTER (WHERE balance_due > 0)::int AS open_invoices FROM invoices WHERE org_id = ${orgId}::uuid AND contact_id = ${contactId}::uuid AND status <> 'void'`,
      prisma.$queryRaw`SELECT id, invoice_number, total, balance_due, status, issue_date, due_date FROM invoices WHERE org_id = ${orgId}::uuid AND contact_id = ${contactId}::uuid ORDER BY issue_date DESC NULLS LAST, created_at DESC LIMIT 5`,
      prisma.$queryRaw`SELECT id, payment_number, amount, payment_date, status FROM payments WHERE org_id = ${orgId}::uuid AND contact_id = ${contactId}::uuid ORDER BY payment_date DESC NULLS LAST, created_at DESC LIMIT 5`,
      prisma.$queryRaw`SELECT id, quotation_number, total, status, created_at FROM quotations WHERE org_id = ${orgId}::uuid AND contact_id = ${contactId}::uuid AND COALESCE(status,'') NOT IN ('accepted','declined','expired','invoiced','converted','cancelled') ORDER BY created_at DESC LIMIT 5`,
      prisma.$queryRaw`SELECT id, total, status, created_at FROM sales_orders WHERE org_id = ${orgId}::uuid AND contact_id = ${contactId}::uuid AND COALESCE(status,'') NOT IN ('closed','cancelled','completed','invoiced') ORDER BY created_at DESC LIMIT 5`
    ]) as [Array<{ outstanding: string; open_invoices: number }>, Array<Record<string, unknown>>, Array<Record<string, unknown>>, Array<Record<string, unknown>>, Array<Record<string, unknown>>];

    const recentPaid = pay.reduce((s, p) => s + n(p.amount), 0);

    return ok({
      kpis: {
        outstanding: n(bal[0]?.outstanding),
        openInvoices: bal[0]?.open_invoices ?? 0,
        openQuotes: quotes.length,
        openOrders: orders.length,
        recentPaid
      },
      recentInvoices: inv,
      recentPayments: pay,
      openQuotes: quotes,
      openOrders: orders
    });
  } catch (error) {
    return fail(500, { code: "DASHBOARD_FAILED", message: errorMessage(error) });
  }
}

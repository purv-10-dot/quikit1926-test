import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export const dynamic = "force-dynamic";

const n = (x: unknown) => Number(x ?? 0);
const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
const pct = (a: number, b: number) => (b === 0 ? 0 : r2((a / b) * 100));

type Line = { name: string; qty: number; revenue: number; cost: number; contribution: number; marginPct: number };

/** How many of the ranked items drive 80% of total positive contribution (Pareto / 80-20). */
function pareto(items: Line[]) {
  const total = items.reduce((s, i) => s + Math.max(0, i.contribution), 0);
  if (total <= 0) return { eighty: 0, count: items.length, total: 0, share: 0 };
  let cum = 0, eighty = 0;
  for (const i of items) { cum += Math.max(0, i.contribution); eighty += 1; if (cum >= total * 0.8) break; }
  return { eighty, count: items.length, total: r2(total), share: pct(eighty, items.length) };
}

/** Unit economics: contribution margin by product and by customer for the period. */
export async function GET(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  const now = new Date();
  const sp = request.nextUrl.searchParams;
  const from = sp.get("from") || `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const to = sp.get("to") || new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  const label = sp.get("from") ? `${from} → ${to}` : now.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  try {
    const productRows = (await prisma.$queryRaw`
      SELECT it.name AS name,
        COALESCE(SUM(il.quantity),0) AS qty,
        COALESCE(SUM(il.line_total),0) AS revenue,
        COALESCE(SUM(il.quantity * COALESCE(it.purchase_price,0)),0) AS cost
      FROM invoice_lines il
      JOIN invoices inv ON inv.id = il.invoice_id
      JOIN items it ON it.id = il.item_id
      WHERE inv.org_id = ${orgId}::uuid AND inv.status NOT IN ('void','draft','cancelled')
        AND inv.issue_date >= ${from}::date AND inv.issue_date <= ${to}::date
      GROUP BY it.id, it.name
    `) as Array<{ name: string; qty: string; revenue: string; cost: string }>;

    const customerRows = (await prisma.$queryRaw`
      SELECT c.display_name AS name,
        COALESCE(SUM(il.line_total),0) AS revenue,
        COALESCE(SUM(il.quantity * COALESCE(it.purchase_price,0)),0) AS cost
      FROM invoices inv
      JOIN contacts c ON c.id = inv.contact_id
      JOIN invoice_lines il ON il.invoice_id = inv.id
      LEFT JOIN items it ON it.id = il.item_id
      WHERE inv.org_id = ${orgId}::uuid AND inv.status NOT IN ('void','draft','cancelled')
        AND inv.issue_date >= ${from}::date AND inv.issue_date <= ${to}::date
      GROUP BY c.id, c.display_name
    `) as Array<{ name: string; revenue: string; cost: string }>;

    const toLine = (r: { name: string; qty?: string; revenue: string; cost: string }): Line => {
      const revenue = r2(n(r.revenue)), cost = r2(n(r.cost));
      const contribution = r2(revenue - cost);
      return { name: r.name, qty: r.qty ? r2(n(r.qty)) : 0, revenue, cost, contribution, marginPct: pct(contribution, revenue) };
    };

    const products = productRows.map(toLine).sort((a, b) => b.contribution - a.contribution);
    const customers = customerRows.map(toLine).sort((a, b) => b.contribution - a.contribution);

    const revenue = r2(customers.reduce((s, c) => s + c.revenue, 0));
    const cost = r2(customers.reduce((s, c) => s + c.cost, 0));
    const contribution = r2(revenue - cost);

    return ok({
      period: { from, to, label },
      totals: { revenue, cost, contribution, marginPct: pct(contribution, revenue) },
      products: products.slice(0, 10),
      customers: customers.slice(0, 10),
      pareto: { products: pareto(products), customers: pareto(customers) }
    });
  } catch (error) {
    return fail(500, { code: "UNIT_ECON_FAILED", message: errorMessage(error) });
  }
}

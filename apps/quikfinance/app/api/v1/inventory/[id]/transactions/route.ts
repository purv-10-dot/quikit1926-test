import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

/**
 * Transactions that reference this item, grouped by document type, for the
 * item detail Transactions tab. Only document types whose line tables carry an
 * item_id are returned (invoices, bills, delivery challans, goods receipts) —
 * quotes/sales-orders/credit-notes have no line items in this app.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;
  const id = params.id;

  try {
    const q = async (sqlText: string) => (await prisma.$queryRawUnsafe(sqlText, id, orgId)) as Array<Record<string, unknown>>;

    const invoices = await q(`
      SELECT i.id, i.invoice_number AS number, to_char(i.issue_date,'YYYY-MM-DD') AS date, i.status,
             COALESCE(SUM(il.quantity),0) AS quantity, COALESCE(SUM(il.line_total),0) AS amount
      FROM invoice_lines il JOIN invoices i ON i.id = il.invoice_id
      WHERE il.item_id=$1::uuid AND il.org_id=$2::uuid
      GROUP BY i.id, i.invoice_number, i.issue_date, i.status
      ORDER BY i.issue_date DESC`);

    const bills = await q(`
      SELECT b.id, b.bill_number AS number, to_char(b.issue_date,'YYYY-MM-DD') AS date, b.status,
             COALESCE(SUM(bl.quantity),0) AS quantity, COALESCE(SUM(bl.line_total),0) AS amount
      FROM bill_lines bl JOIN bills b ON b.id = bl.bill_id
      WHERE bl.item_id=$1::uuid AND bl.org_id=$2::uuid
      GROUP BY b.id, b.bill_number, b.issue_date, b.status
      ORDER BY b.issue_date DESC`);

    const delivery_challans = await q(`
      SELECT dc.id, dc.challan_number AS number, to_char(dc.challan_date,'YYYY-MM-DD') AS date, dc.status,
             COALESCE(SUM(dcl.quantity),0) AS quantity, COALESCE(SUM(dcl.quantity * dcl.rate),0) AS amount
      FROM delivery_challan_lines dcl JOIN delivery_challans dc ON dc.id = dcl.challan_id
      WHERE dcl.item_id=$1::uuid AND dcl.org_id=$2::uuid
      GROUP BY dc.id, dc.challan_number, dc.challan_date, dc.status
      ORDER BY dc.challan_date DESC`);

    const goods_receipts = await q(`
      SELECT gr.id, gr.grn_number AS number, to_char(gr.receipt_date,'YYYY-MM-DD') AS date, gr.status,
             COALESCE(SUM(grl.qty_received),0) AS quantity, COALESCE(SUM(grl.total_cost),0) AS amount
      FROM goods_receipt_lines grl JOIN goods_receipts gr ON gr.id = grl.grn_id
      WHERE grl.item_id=$1::uuid AND gr.org_id=$2::uuid
      GROUP BY gr.id, gr.grn_number, gr.receipt_date, gr.status
      ORDER BY gr.receipt_date DESC`);

    return ok({ invoices, bills, delivery_challans, goods_receipts });
  } catch (error) {
    return fail(500, { code: "FETCH_FAILED", message: errorMessage(error) });
  }
}

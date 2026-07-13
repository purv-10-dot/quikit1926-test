import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

/** All transactions for a customer, grouped by document type (for the Transactions tab). */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;
  const id = params.id;

  try {
    const q = async (sqlText: string) => (await prisma.$queryRawUnsafe(sqlText, id, orgId)) as Array<Record<string, unknown>>;

    const invoices = await q(`SELECT id, invoice_number AS number, to_char(issue_date,'YYYY-MM-DD') AS date, total AS amount, balance_due, status FROM invoices WHERE contact_id=$1::uuid AND org_id=$2::uuid ORDER BY issue_date DESC`);
    const payments = await q(`SELECT id, to_char(payment_date,'YYYY-MM-DD') AS date, amount, method AS mode, status FROM payments WHERE contact_id=$1::uuid AND org_id=$2::uuid AND payment_type='received' ORDER BY payment_date DESC`);
    const quotes = await q(`SELECT id, quotation_number AS number, to_char(issue_date,'YYYY-MM-DD') AS date, total AS amount, status FROM quotations WHERE contact_id=$1::uuid AND org_id=$2::uuid ORDER BY issue_date DESC`);
    const sales_orders = await q(`SELECT id, sales_order_number AS number, to_char(issue_date,'YYYY-MM-DD') AS date, total AS amount, status FROM sales_orders WHERE contact_id=$1::uuid AND org_id=$2::uuid ORDER BY issue_date DESC`);
    const delivery_challans = await q(`SELECT dc.id, dc.challan_number AS number, to_char(dc.challan_date,'YYYY-MM-DD') AS date, dc.status, w.name AS location FROM delivery_challans dc LEFT JOIN warehouses w ON w.id=dc.warehouse_id WHERE dc.contact_id=$1::uuid AND dc.org_id=$2::uuid ORDER BY dc.challan_date DESC`);
    const credit_notes = await q(`SELECT id, credit_note_number AS number, to_char(issue_date,'YYYY-MM-DD') AS date, total AS amount, status FROM credit_notes WHERE contact_id=$1::uuid AND org_id=$2::uuid ORDER BY issue_date DESC`);
    const bills = await q(`SELECT id, bill_number AS number, to_char(issue_date,'YYYY-MM-DD') AS date, total AS amount, balance_due, status FROM bills WHERE contact_id=$1::uuid AND org_id=$2::uuid ORDER BY issue_date DESC`);
    const expenses = await q(`SELECT id, to_char(expense_date,'YYYY-MM-DD') AS date, amount, status FROM expenses WHERE vendor_id=$1::uuid AND org_id=$2::uuid ORDER BY expense_date DESC`);

    const recurring_invoices = await q(`SELECT r.id, r.frequency, to_char(r.next_run_date,'YYYY-MM-DD') AS next_run, r.is_active FROM recurring_transactions r WHERE r.org_id=$2::uuid AND r.source_type='invoice' AND r.source_id IN (SELECT id FROM invoices WHERE contact_id=$1::uuid) ORDER BY r.next_run_date DESC`);
    const recurring_expenses = await q(`SELECT r.id, r.frequency, to_char(r.next_run_date,'YYYY-MM-DD') AS next_run, r.is_active FROM recurring_transactions r WHERE r.org_id=$2::uuid AND r.source_type='expense' AND r.source_id IN (SELECT id FROM expenses WHERE vendor_id=$1::uuid) ORDER BY r.next_run_date DESC`);

    // Journals related to this customer's documents.
    const journals = await q(`
      SELECT je.id, je.entry_number AS number, to_char(je.entry_date,'YYYY-MM-DD') AS date, je.memo, je.source_type, je.status
      FROM journal_entries je
      WHERE je.org_id=$2::uuid AND (
        (je.source_type='invoice' AND je.source_id IN (SELECT id FROM invoices WHERE contact_id=$1::uuid)) OR
        (je.source_type='payment' AND je.source_id IN (SELECT id FROM payments WHERE contact_id=$1::uuid)) OR
        (je.source_type='credit_note' AND je.source_id IN (SELECT id FROM credit_notes WHERE contact_id=$1::uuid)) OR
        (je.source_type='bill' AND je.source_id IN (SELECT id FROM bills WHERE contact_id=$1::uuid))
      ) ORDER BY je.entry_date DESC`);

    return ok({ invoices, payments, quotes, sales_orders, delivery_challans, recurring_invoices, expenses, recurring_expenses, journals, bills, credit_notes });
  } catch (error) {
    return fail(500, { code: "FETCH_FAILED", message: errorMessage(error) });
  }
}

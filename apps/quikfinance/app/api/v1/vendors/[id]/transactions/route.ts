import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

/** All transactions for a vendor, grouped by document type (purchase side). */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;
  const id = params.id;

  try {
    const q = async (sqlText: string) => (await prisma.$queryRawUnsafe(sqlText, id, orgId)) as Array<Record<string, unknown>>;

    const bills = await q(`SELECT id, bill_number AS number, to_char(issue_date,'YYYY-MM-DD') AS date, total AS amount, balance_due, status FROM bills WHERE contact_id=$1::uuid AND org_id=$2::uuid ORDER BY issue_date DESC`);
    const payments = await q(`SELECT id, to_char(payment_date,'YYYY-MM-DD') AS date, amount, method AS mode, status FROM payments WHERE contact_id=$1::uuid AND org_id=$2::uuid AND payment_type='made' ORDER BY payment_date DESC`);
    const purchase_orders = await q(`SELECT id, purchase_order_number AS number, to_char(issue_date,'YYYY-MM-DD') AS date, total AS amount, status FROM purchase_orders WHERE contact_id=$1::uuid AND org_id=$2::uuid ORDER BY issue_date DESC`);
    const vendor_credits = await q(`SELECT id, vendor_credit_number AS number, to_char(issue_date,'YYYY-MM-DD') AS date, total AS amount, status FROM vendor_credits WHERE contact_id=$1::uuid AND org_id=$2::uuid ORDER BY issue_date DESC`);
    const expenses = await q(`SELECT id, to_char(expense_date,'YYYY-MM-DD') AS date, amount, status FROM expenses WHERE vendor_id=$1::uuid AND org_id=$2::uuid ORDER BY expense_date DESC`);

    const recurring_bills = await q(`SELECT r.id, r.frequency, to_char(r.next_run_date,'YYYY-MM-DD') AS next_run, r.is_active FROM recurring_transactions r WHERE r.org_id=$2::uuid AND r.source_type='bill' AND r.source_id IN (SELECT id FROM bills WHERE contact_id=$1::uuid) ORDER BY r.next_run_date DESC`);
    const recurring_expenses = await q(`SELECT r.id, r.frequency, to_char(r.next_run_date,'YYYY-MM-DD') AS next_run, r.is_active FROM recurring_transactions r WHERE r.org_id=$2::uuid AND r.source_type='expense' AND r.source_id IN (SELECT id FROM expenses WHERE vendor_id=$1::uuid) ORDER BY r.next_run_date DESC`);

    const journals = await q(`
      SELECT je.id, je.entry_number AS number, to_char(je.entry_date,'YYYY-MM-DD') AS date, je.memo, je.source_type, je.status
      FROM journal_entries je
      WHERE je.org_id=$2::uuid AND (
        (je.source_type='bill' AND je.source_id IN (SELECT id FROM bills WHERE contact_id=$1::uuid)) OR
        (je.source_type='payment' AND je.source_id IN (SELECT id FROM payments WHERE contact_id=$1::uuid AND payment_type='made')) OR
        (je.source_type='vendor_credit' AND je.source_id IN (SELECT id FROM vendor_credits WHERE contact_id=$1::uuid))
      ) ORDER BY je.entry_date DESC`);

    return ok({ bills, payments, purchase_orders, vendor_credits, expenses, recurring_bills, recurring_expenses, journals });
  } catch (error) {
    return fail(500, { code: "FETCH_FAILED", message: errorMessage(error) });
  }
}

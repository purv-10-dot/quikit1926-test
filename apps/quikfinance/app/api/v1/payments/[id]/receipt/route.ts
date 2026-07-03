import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { fetchAttachments } from "@/lib/accounting/attachments";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

/** Full payment with customer, deposit account, applied invoices and journal — for the receipt view. */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  try {
    const rows = (await prisma.$queryRaw`
      SELECT p.*, to_char(p.payment_date,'YYYY-MM-DD') AS payment_date,
             c.display_name AS customer_name, c.email AS customer_email, c.billing_address,
             w.name AS location, a.name AS deposit_account
      FROM payments p
      LEFT JOIN contacts c ON c.id = p.contact_id
      LEFT JOIN warehouses w ON w.id = p.warehouse_id
      LEFT JOIN accounts a ON a.id = p.deposit_account_id
      WHERE p.id = ${params.id}::uuid AND p.org_id = ${orgId}::uuid LIMIT 1
    `) as Array<Record<string, unknown>>;
    if (!rows.length) return fail(404, { code: "NOT_FOUND", message: "Payment was not found." });

    const allocations = (await prisma.$queryRaw`
      SELECT pa.amount, i.id AS invoice_id, i.invoice_number, to_char(i.issue_date,'YYYY-MM-DD') AS invoice_date, i.total AS invoice_total
      FROM payment_allocations pa JOIN invoices i ON i.id = pa.invoice_id
      WHERE pa.payment_id = ${params.id}::uuid AND pa.org_id = ${orgId}::uuid ORDER BY i.issue_date DESC
    `) as unknown[];

    const bill_allocations = (await prisma.$queryRaw`
      SELECT pa.amount, b.id AS bill_id, b.bill_number, to_char(b.issue_date,'YYYY-MM-DD') AS bill_date, b.total AS bill_total, b.due_date::text AS due_date
      FROM payment_allocations pa JOIN bills b ON b.id = pa.bill_id
      WHERE pa.payment_id = ${params.id}::uuid AND pa.org_id = ${orgId}::uuid ORDER BY b.issue_date DESC
    `) as unknown[];

    const attachments = await fetchAttachments(prisma, orgId, "payment", params.id);

    const journalId = rows[0].journal_entry_id;
    const journal = journalId
      ? ((await prisma.$queryRaw`
          SELECT a.name AS account, a.code AS account_code, jl.debit, jl.credit
          FROM journal_entry_lines jl LEFT JOIN accounts a ON a.id = jl.account_id
          WHERE jl.journal_entry_id = ${journalId}::uuid ORDER BY jl.debit DESC`) as unknown[])
      : [];

    return ok({ ...rows[0], allocations, bill_allocations, attachments, journal });
  } catch (error) {
    return fail(500, { code: "FETCH_FAILED", message: errorMessage(error) });
  }
}

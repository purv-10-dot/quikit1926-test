import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { invoiceSchema } from "@/lib/validations/invoice.schema";
import { saveInvoice } from "@/lib/accounting/invoice-service";
import { reverseJournalFor } from "@/lib/accounting/posting";
import { reverseInventoryFor } from "@/lib/accounting/inventory";
import { assertPeriodUnlocked } from "@/lib/period-locks";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  try {
    const rows = (await prisma.$queryRaw`
      SELECT i.*, to_char(i.issue_date,'YYYY-MM-DD') AS issue_date, to_char(i.due_date,'YYYY-MM-DD') AS due_date,
             c.display_name AS customer_name, c.email AS customer_email, c.billing_address, c.shipping_address, w.name AS location
      FROM invoices i
      LEFT JOIN contacts c ON c.id = i.contact_id
      LEFT JOIN warehouses w ON w.id = i.warehouse_id
      WHERE i.id = ${params.id}::uuid AND i.org_id = ${orgId}::uuid LIMIT 1
    `) as Array<Record<string, unknown>>;
    if (!rows.length) {
      return fail(404, { code: "NOT_FOUND", message: "Invoice was not found." });
    }
    const lines = (await prisma.$queryRaw`
      SELECT il.*, it.name AS item_name FROM invoice_lines il LEFT JOIN items it ON it.id = il.item_id
      WHERE il.invoice_id = ${params.id}::uuid AND il.org_id = ${orgId}::uuid ORDER BY il.display_order ASC
    `) as unknown[];

    // Posted journal entry lines + applied payments (for the detail view).
    const journalId = rows[0].journal_entry_id;
    const journal = journalId
      ? ((await prisma.$queryRaw`
          SELECT a.name AS account, a.code AS account_code, jl.debit, jl.credit, jl.description
          FROM journal_entry_lines jl LEFT JOIN accounts a ON a.id = jl.account_id
          WHERE jl.journal_entry_id = ${journalId}::uuid ORDER BY jl.debit DESC`) as unknown[])
      : [];
    const payments = (await prisma.$queryRaw`
      SELECT p.id, p.amount, p.method, to_char(p.payment_date,'YYYY-MM-DD') AS date, pa.amount AS applied
      FROM payment_allocations pa JOIN payments p ON p.id = pa.payment_id
      WHERE pa.invoice_id = ${params.id}::uuid AND pa.org_id = ${orgId}::uuid ORDER BY p.payment_date DESC`) as unknown[];

    return ok({ ...rows[0], line_items: lines, journal, payments });
  } catch (error) {
    return fail(500, { code: "FETCH_FAILED", message: errorMessage(error) });
  }
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, userId } = auth.context;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = invoiceSchema.safeParse(body);
  if (!parsed.success) {
    return fail(422, { code: "VALIDATION_FAILED", message: "The invoice is invalid.", details: parsed.error.flatten() });
  }

  const locked = await assertPeriodUnlocked(auth.context, parsed.data.issue_date, "sales");
  if (locked) return locked;

  try {
    const exists = (await prisma.$queryRaw`SELECT id FROM invoices WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`) as unknown[];
    if (!exists.length) {
      return fail(404, { code: "NOT_FOUND", message: "Invoice was not found." });
    }
    await prisma.$transaction((tx) => saveInvoice(tx, orgId, userId, parsed.data, params.id));
    const rows = (await prisma.$queryRaw`SELECT * FROM invoices WHERE id = ${params.id}::uuid`) as unknown[];
    return ok(rows[0]);
  } catch (error) {
    return fail(400, { code: "UPDATE_FAILED", message: errorMessage(error) });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  try {
    const dateRows = (await prisma.$queryRaw`SELECT to_char(issue_date,'YYYY-MM-DD') AS d FROM invoices WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`) as Array<{ d: string }>;
    const locked = await assertPeriodUnlocked(auth.context, dateRows[0]?.d, "sales");
    if (locked) return locked;

    const allocated = (await prisma.$queryRaw`
      SELECT COUNT(*)::int AS count FROM payment_allocations WHERE invoice_id = ${params.id}::uuid AND org_id = ${orgId}::uuid
    `) as Array<{ count: number }>;
    if ((allocated[0]?.count ?? 0) > 0) {
      return fail(409, { code: "HAS_PAYMENTS", message: "Unallocate payments before deleting this invoice." });
    }

    await prisma.$transaction(async (tx) => {
      await reverseInventoryFor(tx, orgId, "invoice", params.id);
      await reverseJournalFor(tx, orgId, "invoice", params.id);
      // invoice_lines cascade-delete with the invoice.
      await tx.$executeRaw`DELETE FROM invoices WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    });
    return ok({ id: params.id });
  } catch (error) {
    return fail(400, { code: "DELETE_FAILED", message: errorMessage(error) });
  }
}

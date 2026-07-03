import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { billSchema } from "@/lib/validations/bill.schema";
import { saveBill } from "@/lib/accounting/bill-service";
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
      SELECT b.*, to_char(b.issue_date,'YYYY-MM-DD') AS issue_date, to_char(b.due_date,'YYYY-MM-DD') AS due_date,
             b.vendor_reference AS reference_number,
             c.display_name AS vendor_name, c.email AS vendor_email, c.billing_address, w.name AS location
      FROM bills b
      LEFT JOIN contacts c ON c.id = b.contact_id
      LEFT JOIN warehouses w ON w.id = b.warehouse_id
      WHERE b.id = ${params.id}::uuid AND b.org_id = ${orgId}::uuid LIMIT 1
    `) as Array<Record<string, unknown>>;
    if (!rows.length) return fail(404, { code: "NOT_FOUND", message: "Bill was not found." });
    const lines = (await prisma.$queryRaw`
      SELECT bl.*, i.name AS item_name
      FROM bill_lines bl LEFT JOIN items i ON i.id = bl.item_id
      WHERE bl.bill_id = ${params.id}::uuid AND bl.org_id = ${orgId}::uuid ORDER BY bl.display_order ASC
    `) as unknown[];
    const payments = (await prisma.$queryRaw`
      SELECT pa.amount, to_char(p.payment_date,'YYYY-MM-DD') AS payment_date, p.reference, p.method, p.payment_number
      FROM payment_allocations pa JOIN payments p ON p.id = pa.payment_id
      WHERE pa.bill_id = ${params.id}::uuid AND pa.org_id = ${orgId}::uuid ORDER BY p.payment_date ASC
    `) as unknown[];
    const attachments = (await prisma.$queryRaw`
      SELECT id, file_name, file_path, content_type, size_bytes::int AS size_bytes
      FROM document_attachments WHERE org_id = ${orgId}::uuid AND entity_type = 'bill' AND entity_id = ${params.id}::uuid ORDER BY created_at ASC
    `) as unknown[];
    const journalId = (rows[0] as Record<string, unknown>).journal_entry_id;
    const journal = journalId
      ? ((await prisma.$queryRaw`
          SELECT a.name AS account, a.code, l.debit, l.credit
          FROM journal_entry_lines l JOIN accounts a ON a.id = l.account_id
          WHERE l.journal_entry_id = ${journalId}::uuid AND l.org_id = ${orgId}::uuid ORDER BY l.display_order ASC
        `) as unknown[])
      : [];
    return ok({ ...rows[0], line_items: lines, payments, attachments, journal });
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

  const parsed = billSchema.safeParse(body);
  if (!parsed.success) {
    return fail(422, { code: "VALIDATION_FAILED", message: "The bill is invalid.", details: parsed.error.flatten() });
  }

  const locked = await assertPeriodUnlocked(auth.context, parsed.data.issue_date, "purchases");
  if (locked) return locked;

  try {
    const exists = (await prisma.$queryRaw`SELECT id FROM bills WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`) as unknown[];
    if (!exists.length) return fail(404, { code: "NOT_FOUND", message: "Bill was not found." });
    await prisma.$transaction((tx) => saveBill(tx, orgId, userId, parsed.data, params.id));
    const rows = (await prisma.$queryRaw`SELECT * FROM bills WHERE id = ${params.id}::uuid`) as unknown[];
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
    const dateRows = (await prisma.$queryRaw`SELECT to_char(issue_date,'YYYY-MM-DD') AS d FROM bills WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`) as Array<{ d: string }>;
    const locked = await assertPeriodUnlocked(auth.context, dateRows[0]?.d, "purchases");
    if (locked) return locked;

    const allocated = (await prisma.$queryRaw`
      SELECT COUNT(*)::int AS count FROM payment_allocations WHERE bill_id = ${params.id}::uuid AND org_id = ${orgId}::uuid
    `) as Array<{ count: number }>;
    if ((allocated[0]?.count ?? 0) > 0) {
      return fail(409, { code: "HAS_PAYMENTS", message: "Unallocate payments before deleting this bill." });
    }

    await prisma.$transaction(async (tx) => {
      await reverseInventoryFor(tx, orgId, "bill", params.id);
      await reverseJournalFor(tx, orgId, "bill", params.id);
      await tx.$executeRaw`DELETE FROM document_attachments WHERE org_id = ${orgId}::uuid AND entity_type = 'bill' AND entity_id = ${params.id}::uuid`;
      await tx.$executeRaw`DELETE FROM bills WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    });
    return ok({ id: params.id });
  } catch (error) {
    return fail(400, { code: "DELETE_FAILED", message: errorMessage(error) });
  }
}

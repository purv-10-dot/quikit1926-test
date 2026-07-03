import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { creditNoteSchema } from "@/lib/validations/commercial.schema";
import { saveCreditNote } from "@/lib/accounting/credit-note-service";
import { reverseJournalFor } from "@/lib/accounting/posting";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;
  try {
    const rows = (await prisma.$queryRaw`
      SELECT cn.*, to_char(cn.issue_date,'YYYY-MM-DD') AS issue_date,
             c.display_name AS customer_name, c.email AS customer_email, c.billing_address, c.shipping_address,
             w.name AS location, i.invoice_number AS invoice_no
      FROM credit_notes cn
      LEFT JOIN contacts c ON c.id = cn.contact_id
      LEFT JOIN warehouses w ON w.id = cn.warehouse_id
      LEFT JOIN invoices i ON i.id = cn.invoice_id
      WHERE cn.id = ${params.id}::uuid AND cn.org_id = ${orgId}::uuid LIMIT 1
    `) as Array<Record<string, unknown>>;
    if (!rows.length) return fail(404, { code: "NOT_FOUND", message: "Credit note was not found." });

    const lines = (await prisma.$queryRaw`
      SELECT cl.*, it.name AS item_name FROM credit_note_lines cl LEFT JOIN items it ON it.id = cl.item_id
      WHERE cl.credit_note_id = ${params.id}::uuid AND cl.org_id = ${orgId}::uuid ORDER BY cl.display_order ASC
    `) as unknown[];

    const journalId = rows[0].journal_entry_id;
    const journal = journalId
      ? ((await prisma.$queryRaw`
          SELECT a.name AS account, a.code AS account_code, jl.debit, jl.credit
          FROM journal_entry_lines jl LEFT JOIN accounts a ON a.id = jl.account_id
          WHERE jl.journal_entry_id = ${journalId}::uuid ORDER BY jl.debit DESC`) as unknown[])
      : [];

    return ok({ ...rows[0], line_items: lines, journal });
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

  const parsed = creditNoteSchema.safeParse(body);
  if (!parsed.success) {
    return fail(422, { code: "VALIDATION_FAILED", message: "The credit note is invalid.", details: parsed.error.flatten() });
  }

  try {
    const exists = (await prisma.$queryRaw`SELECT id FROM credit_notes WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`) as unknown[];
    if (!exists.length) return fail(404, { code: "NOT_FOUND", message: "Credit note was not found." });
    await prisma.$transaction((tx) => saveCreditNote(tx, orgId, userId, parsed.data, params.id));
    const rows = (await prisma.$queryRaw`SELECT * FROM credit_notes WHERE id = ${params.id}::uuid`) as unknown[];
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
    await prisma.$transaction(async (tx) => {
      await reverseJournalFor(tx, orgId, "credit_note", params.id);
      await tx.$executeRaw`DELETE FROM credit_notes WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    });
    return ok({ id: params.id });
  } catch (error) {
    return fail(400, { code: "DELETE_FAILED", message: errorMessage(error) });
  }
}

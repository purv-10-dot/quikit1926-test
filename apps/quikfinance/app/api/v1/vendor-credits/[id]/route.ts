import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { vendorCreditSchema } from "@/lib/validations/commercial.schema";
import { saveVendorCredit } from "@/lib/accounting/credit-note-service";
import { reverseJournalFor } from "@/lib/accounting/posting";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;
  try {
    const rows = (await prisma.$queryRaw`
      SELECT vc.*, to_char(vc.issue_date,'YYYY-MM-DD') AS issue_date, to_char(vc.due_date,'YYYY-MM-DD') AS due_date,
             c.display_name AS vendor_name, c.email AS vendor_email, c.billing_address,
             w.name AS location, b.bill_number AS bill_no
      FROM vendor_credits vc
      LEFT JOIN contacts c ON c.id = vc.contact_id
      LEFT JOIN warehouses w ON w.id = vc.warehouse_id
      LEFT JOIN bills b ON b.id = vc.bill_id
      WHERE vc.id = ${params.id}::uuid AND vc.org_id = ${orgId}::uuid LIMIT 1
    `) as Array<Record<string, unknown>>;
    if (!rows.length) return fail(404, { code: "NOT_FOUND", message: "Vendor credit was not found." });

    const lines = (await prisma.$queryRaw`
      SELECT vl.*, it.name AS item_name FROM vendor_credit_lines vl LEFT JOIN items it ON it.id = vl.item_id
      WHERE vl.vendor_credit_id = ${params.id}::uuid AND vl.org_id = ${orgId}::uuid ORDER BY vl.display_order ASC
    `) as unknown[];

    const journal = (await prisma.$queryRaw`
      SELECT a.name AS account, a.code AS account_code, jl.debit, jl.credit
      FROM journal_entry_lines jl
      LEFT JOIN accounts a ON a.id = jl.account_id
      WHERE jl.journal_entry_id IN (
        SELECT id FROM journal_entries WHERE org_id = ${orgId}::uuid AND source_type = 'vendor_credit' AND source_id = ${params.id}::uuid
      ) ORDER BY jl.debit DESC`) as unknown[];

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

  const parsed = vendorCreditSchema.safeParse(body);
  if (!parsed.success) {
    return fail(422, { code: "VALIDATION_FAILED", message: "The vendor credit is invalid.", details: parsed.error.flatten() });
  }

  try {
    const exists = (await prisma.$queryRaw`SELECT id FROM vendor_credits WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`) as unknown[];
    if (!exists.length) return fail(404, { code: "NOT_FOUND", message: "Vendor credit was not found." });
    await prisma.$transaction((tx) => saveVendorCredit(tx, orgId, userId, parsed.data, params.id));
    const rows = (await prisma.$queryRaw`SELECT * FROM vendor_credits WHERE id = ${params.id}::uuid`) as unknown[];
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
      await reverseJournalFor(tx, orgId, "vendor_credit", params.id);
      await tx.$executeRaw`DELETE FROM vendor_credits WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    });
    return ok({ id: params.id });
  } catch (error) {
    return fail(400, { code: "DELETE_FAILED", message: errorMessage(error) });
  }
}

import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { quotationSchema } from "@/lib/validations/commercial.schema";
import { saveQuotation } from "@/lib/accounting/quotation-service";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  try {
    const rows = (await prisma.$queryRaw`
      SELECT q.*, to_char(q.issue_date,'YYYY-MM-DD') AS issue_date, to_char(q.expiry_date,'YYYY-MM-DD') AS expiry_date,
             c.display_name AS customer_name, c.email AS customer_email,
             c.billing_address, c.shipping_address, w.name AS location
      FROM quotations q
      LEFT JOIN contacts c ON c.id = q.contact_id
      LEFT JOIN warehouses w ON w.id = q.warehouse_id
      WHERE q.id = ${params.id}::uuid AND q.org_id = ${orgId}::uuid LIMIT 1
    `) as Array<Record<string, unknown>>;
    if (!rows.length) return fail(404, { code: "NOT_FOUND", message: "Quote was not found." });

    const lines = (await prisma.$queryRaw`
      SELECT ql.*, i.name AS item_name
      FROM quotation_lines ql LEFT JOIN items i ON i.id = ql.item_id
      WHERE ql.quotation_id = ${params.id}::uuid AND ql.org_id = ${orgId}::uuid ORDER BY ql.display_order ASC
    `) as unknown[];
    return ok({ ...rows[0], line_items: lines });
  } catch (error) {
    return fail(500, { code: "FETCH_FAILED", message: errorMessage(error) });
  }
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, db, orgId, userId } = auth.context;

  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }
  const parsed = quotationSchema.safeParse(body);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "The quote is invalid.", details: parsed.error.flatten() });

  try {
    const exists = (await prisma.$queryRaw`SELECT id FROM quotations WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`) as unknown[];
    if (!exists.length) return fail(404, { code: "NOT_FOUND", message: "Quote was not found." });
    await prisma.$transaction((tx) => saveQuotation(tx, orgId, userId, parsed.data, params.id));
    await db.from("audit_logs").insert({ org_id: orgId, user_id: userId, entity_type: "quotation", entity_id: params.id, action: "update", new_values: { total: parsed.data.total } });
    const rows = (await prisma.$queryRaw`SELECT * FROM quotations WHERE id = ${params.id}::uuid`) as unknown[];
    return ok(rows[0]);
  } catch (error) {
    return fail(400, { code: "UPDATE_FAILED", message: errorMessage(error) });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, db, orgId, userId } = auth.context;

  try {
    // quotation_lines cascade-delete with the quote.
    await prisma.$executeRaw`DELETE FROM quotations WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    await db.from("audit_logs").insert({ org_id: orgId, user_id: userId, entity_type: "quotation", entity_id: params.id, action: "delete", new_values: { id: params.id } });
    return ok({ id: params.id });
  } catch (error) {
    return fail(400, { code: "DELETE_FAILED", message: errorMessage(error) });
  }
}

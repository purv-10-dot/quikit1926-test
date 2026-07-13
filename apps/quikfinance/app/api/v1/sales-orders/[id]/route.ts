import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { salesOrderSchema } from "@/lib/validations/commercial.schema";
import { saveSalesOrder } from "@/lib/accounting/sales-order-service";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  try {
    const rows = (await prisma.$queryRaw`
      SELECT so.*, to_char(so.issue_date,'YYYY-MM-DD') AS issue_date, to_char(so.expected_shipment_date,'YYYY-MM-DD') AS expected_shipment_date,
             c.display_name AS customer_name, c.email AS customer_email, c.billing_address, c.shipping_address, w.name AS location
      FROM sales_orders so
      LEFT JOIN contacts c ON c.id = so.contact_id
      LEFT JOIN warehouses w ON w.id = so.warehouse_id
      WHERE so.id = ${params.id}::uuid AND so.org_id = ${orgId}::uuid LIMIT 1
    `) as Array<Record<string, unknown>>;
    if (!rows.length) return fail(404, { code: "NOT_FOUND", message: "Sales order was not found." });

    const lines = (await prisma.$queryRaw`
      SELECT sl.*, i.name AS item_name
      FROM sales_order_lines sl LEFT JOIN items i ON i.id = sl.item_id
      WHERE sl.sales_order_id = ${params.id}::uuid AND sl.org_id = ${orgId}::uuid ORDER BY sl.display_order ASC
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
  const parsed = salesOrderSchema.safeParse(body);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "The sales order is invalid.", details: parsed.error.flatten() });

  try {
    const exists = (await prisma.$queryRaw`SELECT id FROM sales_orders WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`) as unknown[];
    if (!exists.length) return fail(404, { code: "NOT_FOUND", message: "Sales order was not found." });
    await prisma.$transaction((tx) => saveSalesOrder(tx, orgId, userId, parsed.data, params.id));
    await db.from("audit_logs").insert({ org_id: orgId, user_id: userId, entity_type: "sales_order", entity_id: params.id, action: "update", new_values: { total: parsed.data.total } });
    const rows = (await prisma.$queryRaw`SELECT * FROM sales_orders WHERE id = ${params.id}::uuid`) as unknown[];
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
    await prisma.$executeRaw`DELETE FROM sales_orders WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    await db.from("audit_logs").insert({ org_id: orgId, user_id: userId, entity_type: "sales_order", entity_id: params.id, action: "delete", new_values: { id: params.id } });
    return ok({ id: params.id });
  } catch (error) {
    return fail(400, { code: "DELETE_FAILED", message: errorMessage(error) });
  }
}

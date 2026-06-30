import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { purchaseOrderSchema } from "@/lib/validations/commercial.schema";
import { savePurchaseOrder } from "@/lib/accounting/purchase-order-service";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  try {
    const rows = (await prisma.$queryRaw`
      SELECT po.*, to_char(po.issue_date,'YYYY-MM-DD') AS issue_date, to_char(po.expected_delivery_date,'YYYY-MM-DD') AS expected_delivery_date,
             c.display_name AS vendor_name, c.email AS vendor_email, c.billing_address, c.shipping_address, w.name AS location,
             b.bill_number AS bill_no
      FROM purchase_orders po
      LEFT JOIN contacts c ON c.id = po.contact_id
      LEFT JOIN warehouses w ON w.id = po.warehouse_id
      LEFT JOIN bills b ON b.id = po.bill_id
      WHERE po.id = ${params.id}::uuid AND po.org_id = ${orgId}::uuid LIMIT 1
    `) as Array<Record<string, unknown>>;
    if (!rows.length) return fail(404, { code: "NOT_FOUND", message: "Purchase order was not found." });

    const lines = (await prisma.$queryRaw`
      SELECT pl.*, i.name AS item_name
      FROM purchase_order_lines pl LEFT JOIN items i ON i.id = pl.item_id
      WHERE pl.purchase_order_id = ${params.id}::uuid AND pl.org_id = ${orgId}::uuid ORDER BY pl.display_order ASC
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
  const parsed = purchaseOrderSchema.safeParse(body);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "The purchase order is invalid.", details: parsed.error.flatten() });

  try {
    const exists = (await prisma.$queryRaw`SELECT id FROM purchase_orders WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`) as unknown[];
    if (!exists.length) return fail(404, { code: "NOT_FOUND", message: "Purchase order was not found." });
    await prisma.$transaction((tx) => savePurchaseOrder(tx, orgId, userId, parsed.data, params.id));
    await db.from("audit_logs").insert({ org_id: orgId, user_id: userId, entity_type: "purchase_order", entity_id: params.id, action: "update", new_values: { total: parsed.data.total } });
    const rows = (await prisma.$queryRaw`SELECT * FROM purchase_orders WHERE id = ${params.id}::uuid`) as unknown[];
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
    await prisma.$executeRaw`DELETE FROM purchase_orders WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    await db.from("audit_logs").insert({ org_id: orgId, user_id: userId, entity_type: "purchase_order", entity_id: params.id, action: "delete", new_values: { id: params.id } });
    return ok({ id: params.id });
  } catch (error) {
    return fail(400, { code: "DELETE_FAILED", message: errorMessage(error) });
  }
}

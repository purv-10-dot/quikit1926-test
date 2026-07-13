import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { deliveryChallanSchema, saveDeliveryChallan } from "@/lib/accounting/delivery-challan-service";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  try {
    const rows = (await prisma.$queryRaw`
      SELECT dc.*, to_char(dc.challan_date,'YYYY-MM-DD') AS challan_date,
             c.display_name AS customer_name, c.email AS customer_email, c.billing_address, c.shipping_address, w.name AS location
      FROM delivery_challans dc
      LEFT JOIN contacts c ON c.id = dc.contact_id
      LEFT JOIN warehouses w ON w.id = dc.warehouse_id
      WHERE dc.id = ${params.id}::uuid AND dc.org_id = ${orgId}::uuid LIMIT 1
    `) as Array<Record<string, unknown>>;
    if (!rows.length) return fail(404, { code: "NOT_FOUND", message: "Delivery challan was not found." });

    const lines = (await prisma.$queryRaw`
      SELECT dcl.*, i.name AS item_name, i.sku
      FROM delivery_challan_lines dcl LEFT JOIN items i ON i.id = dcl.item_id
      WHERE dcl.challan_id = ${params.id}::uuid ORDER BY dcl.display_order ASC
    `) as unknown[];

    return ok({ ...rows[0], lines });
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

  const parsed = deliveryChallanSchema.safeParse(body);
  if (!parsed.success) {
    return fail(422, { code: "VALIDATION_FAILED", message: "The delivery challan is invalid.", details: parsed.error.flatten() });
  }

  try {
    const exists = (await prisma.$queryRaw`SELECT id FROM delivery_challans WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`) as unknown[];
    if (!exists.length) return fail(404, { code: "NOT_FOUND", message: "Delivery challan was not found." });
    await prisma.$transaction((tx) => saveDeliveryChallan(tx, orgId, userId, parsed.data, params.id));
    const rows = (await prisma.$queryRaw`SELECT * FROM delivery_challans WHERE id = ${params.id}::uuid`) as unknown[];
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
      await tx.$executeRaw`DELETE FROM delivery_challan_lines WHERE challan_id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
      await tx.$executeRaw`DELETE FROM delivery_challans WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    });
    return ok({ id: params.id });
  } catch (error) {
    return fail(400, { code: "DELETE_FAILED", message: errorMessage(error) });
  }
}

import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { assertModuleEnabled } from "@/lib/module-guard";
import { salesOrderSchema } from "@/lib/validations/commercial.schema";
import { saveSalesOrder } from "@/lib/accounting/sales-order-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  const page = Math.max(Number(request.nextUrl.searchParams.get("page") ?? "1"), 1);
  const perPage = Math.min(Math.max(Number(request.nextUrl.searchParams.get("per_page") ?? "25"), 1), 100);
  const offset = (page - 1) * perPage;
  const search = request.nextUrl.searchParams.get("search");

  try {
    const countRows = (await prisma.$queryRaw`
      SELECT COUNT(*)::bigint AS count FROM sales_orders
      WHERE org_id = ${orgId}::uuid AND (${search}::text IS NULL OR sales_order_number ILIKE ${`%${search ?? ""}%`})
    `) as Array<{ count: bigint }>;
    const total = Number(countRows[0]?.count ?? 0);

    const data = (await prisma.$queryRaw`
      SELECT so.*, to_char(so.issue_date,'YYYY-MM-DD') AS date,
             to_char(so.expected_shipment_date,'YYYY-MM-DD') AS shipment_date,
             c.display_name AS customer_name, w.name AS location
      FROM sales_orders so
      LEFT JOIN contacts c ON c.id = so.contact_id
      LEFT JOIN warehouses w ON w.id = so.warehouse_id
      WHERE so.org_id = ${orgId}::uuid AND (${search}::text IS NULL OR so.sales_order_number ILIKE ${`%${search ?? ""}%`})
      ORDER BY so.created_at DESC
      LIMIT ${perPage} OFFSET ${offset}
    `) as unknown[];

    return ok(data, { total, page, per_page: perPage });
  } catch (error) {
    return fail(500, { code: "LIST_FAILED", message: errorMessage(error) });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, db, orgId, userId } = auth.context;

  const moduleOff = await assertModuleEnabled(auth.context, "sales_orders");
  if (moduleOff) return moduleOff;

  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }
  const parsed = salesOrderSchema.safeParse(body);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "The sales order is invalid.", details: parsed.error.flatten() });

  try {
    const result = await prisma.$transaction((tx) => saveSalesOrder(tx, orgId, userId, parsed.data));
    await db.from("audit_logs").insert({ org_id: orgId, user_id: userId, entity_type: "sales_order", entity_id: result.id, action: "create", new_values: { total: parsed.data.total } });
    const rows = (await prisma.$queryRaw`SELECT * FROM sales_orders WHERE id = ${result.id}::uuid`) as unknown[];
    return ok(rows[0], undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "CREATE_FAILED", message: errorMessage(error) });
  }
}

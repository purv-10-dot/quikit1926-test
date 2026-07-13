import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { assertModuleEnabled } from "@/lib/module-guard";
import { purchaseOrderSchema } from "@/lib/validations/commercial.schema";
import { savePurchaseOrder } from "@/lib/accounting/purchase-order-service";
import { loadPurchaseOrderSettings } from "@/lib/settings/purchase-order";
import { nextDocumentNumber } from "@/lib/accounting/numbering";

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
      SELECT COUNT(*)::bigint AS count FROM purchase_orders
      WHERE org_id = ${orgId}::uuid AND (${search}::text IS NULL OR purchase_order_number ILIKE ${`%${search ?? ""}%`})
    `) as Array<{ count: bigint }>;
    const total = Number(countRows[0]?.count ?? 0);

    const data = (await prisma.$queryRaw`
      SELECT po.*, to_char(po.issue_date,'YYYY-MM-DD') AS date,
             to_char(po.expected_delivery_date,'YYYY-MM-DD') AS delivery_date,
             c.display_name AS vendor_name, w.name AS location
      FROM purchase_orders po
      LEFT JOIN contacts c ON c.id = po.contact_id
      LEFT JOIN warehouses w ON w.id = po.warehouse_id
      WHERE po.org_id = ${orgId}::uuid AND (${search}::text IS NULL OR po.purchase_order_number ILIKE ${`%${search ?? ""}%`})
      ORDER BY po.created_at DESC
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

  const moduleOff = await assertModuleEnabled(auth.context, "purchase_orders");
  if (moduleOff) return moduleOff;

  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }
  const parsed = purchaseOrderSchema.safeParse(body);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "The purchase order is invalid.", details: parsed.error.flatten() });

  // Purchase order numbering (Settings → Purchase Orders): require a number when auto-generate is off.
  const numbering = await loadPurchaseOrderSettings(prisma, orgId);
  const providedNumber = parsed.data.purchase_order_number && parsed.data.purchase_order_number.length > 0;
  if (!providedNumber && !numbering.auto_generate_number) {
    return fail(422, { code: "PURCHASE_ORDER_NUMBER_REQUIRED", message: "Enter a purchase order number, or enable auto-generation in Settings → Purchase Orders." });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      let data = parsed.data;
      if (!providedNumber && numbering.auto_generate_number) {
        data = { ...data, purchase_order_number: await nextDocumentNumber(tx, orgId, "purchase_order", { locationId: data.warehouse_id ?? null, fallbackPrefix: numbering.prefix, fallbackFloor: numbering.next_number }) };
      }
      return savePurchaseOrder(tx, orgId, userId, data);
    });
    await db.from("audit_logs").insert({ org_id: orgId, user_id: userId, entity_type: "purchase_order", entity_id: result.id, action: "create", new_values: { total: parsed.data.total } });
    const rows = (await prisma.$queryRaw`SELECT * FROM purchase_orders WHERE id = ${result.id}::uuid`) as unknown[];
    return ok(rows[0], undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "CREATE_FAILED", message: errorMessage(error) });
  }
}

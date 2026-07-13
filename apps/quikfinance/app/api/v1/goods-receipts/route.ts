import { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { assertModuleEnabled } from "@/lib/module-guard";
import { grnSchema, saveGoodsReceipt } from "@/lib/accounting/grn-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { db, orgId } = auth.context;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const limit = Math.min(100, Number(searchParams.get("limit") ?? 50));
  const offset = (page - 1) * limit;
  const status = searchParams.get("status");
  const vendorId = searchParams.get("vendor_id");

  try {
    let query = db
      .from("goods_receipts")
      .select(
        `id, grn_number, receipt_date, status, bill_id, notes, created_at,
         contacts!vendor_id(id, display_name),
         warehouses!warehouse_id(id, name),
         purchase_orders!purchase_order_id(id, purchase_order_number)`,
        { count: "exact" }
      )
      .eq("org_id", orgId)
      .order("receipt_date", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq("status", status);
    if (vendorId) query = query.eq("vendor_id", vendorId);

    const { data, count, error } = await query;
    if (error) throw error;

    return ok(data ?? [], { total: count ?? 0, page, limit });
  } catch (e) {
    return fail(500, { code: "FETCH_ERROR", message: errorMessage(e) });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, userId } = auth.context;

  const moduleOff = await assertModuleEnabled(auth.context, "goods_receipts");
  if (moduleOff) return moduleOff;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = grnSchema.safeParse(body);
  if (!parsed.success) {
    return fail(422, { code: "VALIDATION_FAILED", message: "The goods receipt is invalid.", details: parsed.error.flatten() });
  }

  try {
    const result = await prisma.$transaction((tx) => saveGoodsReceipt(tx, orgId, userId, parsed.data));
    const rows = (await prisma.$queryRaw`SELECT * FROM goods_receipts WHERE id = ${result.id}::uuid`) as unknown[];
    return ok(rows[0], undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "CREATE_FAILED", message: errorMessage(error) });
  }
}

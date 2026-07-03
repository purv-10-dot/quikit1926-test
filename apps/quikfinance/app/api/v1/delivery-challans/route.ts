import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { assertModuleEnabled } from "@/lib/module-guard";
import { deliveryChallanSchema, saveDeliveryChallan } from "@/lib/accounting/delivery-challan-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(200, Number(searchParams.get("limit") ?? 100));

  try {
    const rows = (await prisma.$queryRaw`
      SELECT dc.id, dc.challan_number, to_char(dc.challan_date,'YYYY-MM-DD') AS challan_date, dc.challan_type, dc.status, dc.reference,
             dc.total, dc.invoice_id, dc.created_at, c.display_name AS customer, w.name AS location
      FROM delivery_challans dc
      LEFT JOIN contacts c ON c.id = dc.contact_id
      LEFT JOIN warehouses w ON w.id = dc.warehouse_id
      WHERE dc.org_id = ${orgId}::uuid
      ORDER BY dc.challan_date DESC, dc.created_at DESC
      LIMIT ${limit}
    `) as unknown[];
    return ok(rows);
  } catch (e) {
    return fail(500, { code: "FETCH_ERROR", message: errorMessage(e) });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, userId } = auth.context;

  const moduleOff = await assertModuleEnabled(auth.context, "delivery_challans");
  if (moduleOff) return moduleOff;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = deliveryChallanSchema.safeParse(body);
  if (!parsed.success) {
    return fail(422, { code: "VALIDATION_FAILED", message: "The delivery challan is invalid.", details: parsed.error.flatten() });
  }

  try {
    const result = await prisma.$transaction((tx) => saveDeliveryChallan(tx, orgId, userId, parsed.data));
    const rows = (await prisma.$queryRaw`SELECT * FROM delivery_challans WHERE id = ${result.id}::uuid`) as unknown[];
    return ok(rows[0], undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "CREATE_FAILED", message: errorMessage(error) });
  }
}

import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  try {
    const rows = (await prisma.$queryRaw`
      SELECT g.*, c.display_name AS vendor_name
      FROM goods_receipts g LEFT JOIN contacts c ON c.id = g.vendor_id
      WHERE g.id = ${params.id}::uuid AND g.org_id = ${orgId}::uuid LIMIT 1
    `) as Array<Record<string, unknown>>;
    if (!rows.length) return fail(404, { code: "NOT_FOUND", message: "Goods receipt was not found." });

    const lines = (await prisma.$queryRaw`
      SELECT grl.*, i.name AS item_name, i.sku
      FROM goods_receipt_lines grl LEFT JOIN items i ON i.id = grl.item_id
      WHERE grl.grn_id = ${params.id}::uuid ORDER BY grl.id
    `) as unknown[];

    return ok({ ...rows[0], lines });
  } catch (error) {
    return fail(500, { code: "FETCH_FAILED", message: errorMessage(error) });
  }
}

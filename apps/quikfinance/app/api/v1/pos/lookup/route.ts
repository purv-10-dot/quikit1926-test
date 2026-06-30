import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export const dynamic = "force-dynamic";

/** Resolve a scanned/typed code to an item (matches barcode, then SKU). */
export async function GET(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;
  const code = (request.nextUrl.searchParams.get("code") ?? "").trim();
  if (!code) return fail(422, { code: "NO_CODE", message: "code is required." });
  try {
    const rows = (await prisma.$queryRaw`
      SELECT id, name, sku, barcode, COALESCE(sales_price,0) AS sales_price, image_url
      FROM items
      WHERE org_id = ${orgId}::uuid AND is_active = true AND (barcode = ${code} OR sku = ${code})
      ORDER BY (barcode = ${code}) DESC LIMIT 1`) as Array<Record<string, unknown>>;
    if (!rows.length) return fail(404, { code: "NOT_FOUND", message: `No item for code ${code}.` });
    return ok(rows[0]);
  } catch (error) {
    return fail(500, { code: "POS_LOOKUP_FAILED", message: errorMessage(error) });
  }
}

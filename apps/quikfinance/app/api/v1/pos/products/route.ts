import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export const dynamic = "force-dynamic";

/** Catalog for the POS: sellable items + categories + the walk-in customer id. */
export async function GET() {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;
  try {
    const [products, categories, walkin] = await Promise.all([
      prisma.$queryRaw`
        SELECT id, name, sku, barcode, COALESCE(sales_price,0) AS sales_price, COALESCE(gst_rate,0) AS gst_rate,
               category_id, subcategory_id, image_url, item_type, track_inventory
        FROM items WHERE org_id = ${orgId}::uuid AND is_active = true ORDER BY name`,
      prisma.$queryRaw`SELECT id, name, parent_id FROM item_categories WHERE org_id = ${orgId}::uuid AND is_active = true ORDER BY name`,
      prisma.$queryRaw`SELECT id FROM contacts WHERE org_id = ${orgId}::uuid AND type = 'customer' AND display_name = 'Walk-in Customer' LIMIT 1`
    ]) as [Array<Record<string, unknown>>, Array<Record<string, unknown>>, Array<{ id: string }>];
    return ok({ products, categories, walkInCustomerId: walkin[0]?.id ?? null });
  } catch (error) {
    return fail(500, { code: "POS_PRODUCTS_FAILED", message: errorMessage(error) });
  }
}

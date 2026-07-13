import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";

const auth = withOrgAuthForResource("Asset");

export const POST = auth.create(async ({ orgId }, req) => {
  const rows: Record<string, string>[] = await req.json();

  const results = { created: 0, failed: 0, errors: [] as string[] };

  for (const row of rows) {
    try {
      // resolve or create base category (scoped to org)
      let baseCategory = await db.astBaseCategory.findFirst({
        where: { orgId, name: { equals: row.baseCategory, mode: "insensitive" } },
      });
      if (!baseCategory) {
        baseCategory = await db.astBaseCategory.create({ data: { orgId, name: row.baseCategory } });
      }

      // resolve or create category (scoped to org)
      let category = await db.astCategory.findFirst({
        where: {
          orgId,
          name: { equals: row.category, mode: "insensitive" },
          baseCategoryId: baseCategory.id,
        },
      });
      if (!category) {
        category = await db.astCategory.create({
          data: { orgId, name: row.category, baseCategoryId: baseCategory.id },
        });
      }

      await db.astAsset.create({
        data: {
          orgId,
          warehouse: row.warehouse || null,
          assetType: row.assetType,
          baseCategoryId: baseCategory.id,
          categoryId: category.id,
          itemName: row.itemName,
          itemCode: row.itemCode,
          serialNumber: row.serialNumber,
          invoiceNumber: row.invoiceNumber,
          price: row.price ? parseFloat(row.price) : null,
          purchaseDate: row.purchaseDate,
          location: row.location,
          condition: row.condition,
          description: row.description || "",
          assetStatus: "Available",
        },
      });
      results.created++;
    } catch (e: unknown) {
      results.failed++;
      results.errors.push(e instanceof Error ? e.message : "Unknown error");
    }
  }

  return NextResponse.json({ success: true, data: results });
});

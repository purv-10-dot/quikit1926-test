import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { serializeProduct } from "@/lib/services/products/serialize";

export const runtime = "nodejs";

/** GET /api/products/export — CSV download of active products. */
export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "view");

    const items = await prisma.crmProduct.findMany({
      where: { orgId: user.orgId, deletedAt: null },
      include: {
        categoryRef: { select: { id: true, name: true } },
        brandRef: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
      take: 5000,
    });

    const header = [
      "sku",
      "name",
      "category",
      "brand",
      "barcode",
      "hsnCode",
      "sacCode",
      "gstRate",
      "listPrice",
      "manufacturer",
      "isActive",
    ];
    const rows = items.map((p) => {
      const s = serializeProduct(p);
      return [
        s.sku,
        s.name,
        s.categoryName ?? "",
        s.brandName ?? "",
        s.barcode ?? "",
        s.hsnCode ?? "",
        s.sacCode ?? "",
        String(s.gstRate),
        String(s.listPrice),
        s.manufacturer ?? "",
        s.isActive ? "true" : "false",
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(",");
    });

    const csv = [header.join(","), ...rows].join("\n");
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="products-export.csv"`,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Export failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { exportPriceListItems } from "@/lib/services/quotes/price-list-service";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "export");

    const rows = await exportPriceListItems(user.orgId, id);
    if (!rows) {
      return NextResponse.json({ success: false, error: "Price list not found" }, { status: 404 });
    }

    const header =
      "sku,productName,catalogListPrice,unitPrice,discountPct,minQuantity,floorPrice,notes\n";
    const body = rows
      .map((r) =>
        [
          r.sku,
          `"${String(r.productName).replace(/"/g, '""')}"`,
          r.catalogListPrice ?? "",
          r.unitPrice,
          r.discountPct,
          r.minQuantity,
          r.floorPrice ?? "",
          `"${String(r.notes).replace(/"/g, '""')}"`,
        ].join(","),
      )
      .join("\n");

    return new NextResponse(header + body, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="price-list-${id}.csv"`,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Export failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

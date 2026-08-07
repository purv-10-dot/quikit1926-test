import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { productVariantSchema } from "@/lib/services/quotes/validators";
import { getProduct } from "@/lib/services/quotes/product-service";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "view");
    const items = await prisma.qcfProductVariant.findMany({
      where: { orgId: user.orgId, productId: id },
      orderBy: { sku: "asc" },
    });
    return NextResponse.json({ success: true, data: items });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list variants";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "create");
    const p = await getProduct(user.orgId, id);
    if (!p) return NextResponse.json({ success: false, error: "Product not found" }, { status: 404 });

    const parsed = productVariantSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid variant" }, { status: 400 });
    }

    const created = await prisma.qcfProductVariant.create({
      data: {
        orgId: user.orgId,
        productId: id,
        sku: parsed.data.sku,
        name: parsed.data.name ?? null,
        barcode: parsed.data.barcode ?? null,
        attributes: (parsed.data.attributes ?? undefined) as object | undefined,
        listPrice: parsed.data.listPrice ?? null,
        standardCost: parsed.data.standardCost ?? null,
        gstRate: parsed.data.gstRate ?? null,
        isActive: parsed.data.isActive ?? true,
      },
    });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err.code === "P2002") {
      return NextResponse.json({ success: false, error: "Duplicate variant SKU" }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "Failed to create variant";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

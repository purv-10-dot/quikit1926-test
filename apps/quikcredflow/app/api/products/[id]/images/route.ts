import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { productImageSchema } from "@/lib/services/quotes/validators";
import { getProduct } from "@/lib/services/quotes/product-service";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "view");
    const items = await prisma.qcfProductImage.findMany({
      where: { orgId: user.orgId, productId: id },
      orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
    });
    return NextResponse.json({ success: true, data: items });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list images";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "edit");
    const p = await getProduct(user.orgId, id);
    if (!p) return NextResponse.json({ success: false, error: "Product not found" }, { status: 404 });

    const parsed = productImageSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid image" }, { status: 400 });
    }

    if (parsed.data.isPrimary) {
      await prisma.qcfProductImage.updateMany({
        where: { orgId: user.orgId, productId: id },
        data: { isPrimary: false },
      });
    }

    const created = await prisma.qcfProductImage.create({
      data: {
        orgId: user.orgId,
        productId: id,
        url: parsed.data.url,
        label: parsed.data.label ?? null,
        sortOrder: parsed.data.sortOrder ?? 0,
        isPrimary: parsed.data.isPrimary ?? false,
      },
    });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to add image";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

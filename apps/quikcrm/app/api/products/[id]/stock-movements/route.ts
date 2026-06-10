import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { stockMovementSchema } from "@/lib/services/quotes/validators";
import { getProduct } from "@/lib/services/quotes/product-service";
import { listStockMovements, recordStockMovement } from "@/lib/services/products/inventory";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "view");
    const p = await getProduct(user.orgId, id);
    if (!p) return NextResponse.json({ success: false, error: "Product not found" }, { status: 404 });
    const items = await listStockMovements(user.orgId, id);
    return NextResponse.json({ success: true, data: items });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list movements";
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

    const parsed = stockMovementSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid movement" }, { status: 400 });
    }

    const movement = await recordStockMovement({
      orgId: user.orgId,
      productId: id,
      userId: user.userId,
      ...parsed.data,
    });
    return NextResponse.json({ success: true, data: movement }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to record movement";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

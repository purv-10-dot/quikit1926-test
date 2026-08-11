import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import {
  updatePriceListSchema,
} from "@/lib/services/quotes/validators";
import {
  getPriceList,
  softDeletePriceList,
  updatePriceList,
} from "@/lib/services/quotes/price-list-service";
import { toNumber } from "@/lib/services/quotes/decimal";

export const runtime = "nodejs";

function ok<T>(data: T): NextResponse {
  return NextResponse.json({ success: true, data });
}
function fail(status: number, error: string, fieldErrors?: Record<string, string>): NextResponse {
  return NextResponse.json(
    { success: false, error, ...(fieldErrors ? { fieldErrors } : {}) },
    { status },
  );
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "view");
    const pl = await getPriceList(user.tenantId, id);
    if (!pl) return fail(404, "Price list not found");
    return ok({
      ...pl,
      items: pl.items.map((it) => ({
        ...it,
        unitPrice: toNumber(it.unitPrice),
        discountPct: toNumber(it.discountPct),
        floorPrice: it.floorPrice != null ? toNumber(it.floorPrice) : null,
        product: it.product
          ? {
              ...it.product,
              listPrice: toNumber(it.product.listPrice),
              gstRate: toNumber(it.product.gstRate),
            }
          : null,
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load price list";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/price-lists/:id GET]", error);
    return fail(status, message);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "edit");

    const existing = await getPriceList(user.tenantId, id);
    if (!existing) return fail(404, "Price list not found");

    const body = await req.json().catch(() => null);
    const parsed = updatePriceListSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        400,
        "Validation failed",
        parsed.error.flatten().fieldErrors as Record<string, string>,
      );
    }

    try {
      const updated = await updatePriceList({
        tenantId: user.tenantId,
        id,
        userId: user.userId,
        userName: user.name,
        input: parsed.data,
      });
      return ok(updated);
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === "P2002") {
        return fail(409, "A price list with this name already exists.", {
          name: "Duplicate name",
        });
      }
      throw e;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update price list";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/price-lists/:id PATCH]", error);
    return fail(status, message);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "delete");

    const existing = await getPriceList(user.tenantId, id);
    if (!existing) return fail(404, "Price list not found");
    await softDeletePriceList({
      tenantId: user.tenantId,
      id,
      userId: user.userId,
      userName: user.name,
    });
    return ok({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete price list";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/price-lists/:id DELETE]", error);
    return fail(status, message);
  }
}

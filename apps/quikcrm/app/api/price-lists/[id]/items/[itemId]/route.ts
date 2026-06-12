import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { canOverridePriceFloor } from "@/lib/api/price-list-permissions";
import { updatePriceListItemSchema } from "@/lib/services/quotes/validators";
import {
  PriceListItemError,
  deletePriceListItem,
  updatePriceListItem,
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const { itemId } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "edit");

    const body = await req.json().catch(() => null);
    const parsed = updatePriceListItemSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        400,
        "Validation failed",
        parsed.error.flatten().fieldErrors as Record<string, string>,
      );
    }

    try {
      const updated = await updatePriceListItem({
        orgId: user.orgId,
        itemId,
        userId: user.userId,
        userName: user.name,
        allowBelowFloor: canOverridePriceFloor(
          user,
          (body as { allowBelowFloor?: boolean } | null)?.allowBelowFloor,
        ),
        input: parsed.data,
      });
      return ok({
        ...updated,
        unitPrice: toNumber(updated.unitPrice),
        discountPct: toNumber(updated.discountPct),
        floorPrice: updated.floorPrice != null ? toNumber(updated.floorPrice) : null,
      });
    } catch (e: unknown) {
      if (e instanceof PriceListItemError) {
        return fail(e.statusCode, e.message);
      }
      throw e;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update price list item";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/price-lists/:id/items/:itemId PATCH]", error);
    return fail(status, message);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const { itemId } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "delete");
    await deletePriceListItem({
      orgId: user.orgId,
      itemId,
      userId: user.userId,
      userName: user.name,
    });
    return ok({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to remove price list item";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/price-lists/:id/items/:itemId DELETE]", error);
    return fail(status, message);
  }
}

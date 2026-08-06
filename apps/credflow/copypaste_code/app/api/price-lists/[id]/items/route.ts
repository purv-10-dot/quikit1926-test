import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { canOverridePriceFloor } from "@/lib/api/price-list-permissions";
import { priceListItemSchema } from "@/lib/services/quotes/validators";
import {
  PriceListItemError,
  addPriceListItem,
  getPriceList,
} from "@/lib/services/quotes/price-list-service";
import { toNumber } from "@/lib/services/quotes/decimal";

export const runtime = "nodejs";

function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ success: true, data }, init);
}
function fail(status: number, error: string, fieldErrors?: Record<string, string>): NextResponse {
  return NextResponse.json(
    { success: false, error, ...(fieldErrors ? { fieldErrors } : {}) },
    { status },
  );
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "edit");

    const pl = await getPriceList(user.tenantId, id);
    if (!pl) return fail(404, "Price list not found");

    const body = await req.json().catch(() => null);
    const parsed = priceListItemSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        400,
        "Validation failed",
        parsed.error.flatten().fieldErrors as Record<string, string>,
      );
    }

    try {
      const created = await addPriceListItem({
        tenantId: user.tenantId,
        priceListId: id,
        userId: user.userId,
        userName: user.name,
        allowBelowFloor: canOverridePriceFloor(
          user,
          (body as { allowBelowFloor?: boolean } | null)?.allowBelowFloor,
        ),
        input: parsed.data,
      });
      return ok(
        {
          ...created,
          unitPrice: toNumber(created.unitPrice),
          discountPct: toNumber(created.discountPct),
          floorPrice: created.floorPrice != null ? toNumber(created.floorPrice) : null,
        },
        { status: 201 },
      );
    } catch (e: unknown) {
      // Tenant-scoped FK checks throw PriceListItemError (404 if priceList
      // or product belong to a different tenant). Surface that distinctly
      // from a Prisma unique-constraint clash.
      if (e instanceof PriceListItemError) {
        return fail(e.statusCode, e.message);
      }
      const err = e as { code?: string };
      if (err.code === "P2002") {
        return fail(409, "This product is already on the price list at the same quantity bracket.");
      }
      throw e;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to add product to price list";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/price-lists/:id/items POST]", error);
    return fail(status, message);
  }
}

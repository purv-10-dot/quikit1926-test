import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { canOverridePriceFloor } from "@/lib/api/price-list-permissions";
import { bulkPriceListItemsSchema } from "@/lib/services/quotes/validators";
import {
  PriceListItemError,
  bulkUpdatePriceListItems,
  getPriceList,
} from "@/lib/services/quotes/price-list-service";

export const runtime = "nodejs";

function ok<T>(data: T): NextResponse {
  return NextResponse.json({ success: true, data });
}
function fail(status: number, error: string): NextResponse {
  return NextResponse.json({ success: false, error }, { status });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "edit");

    const pl = await getPriceList(user.orgId, id);
    if (!pl) return fail(404, "Price list not found");

    const body = await req.json().catch(() => null);
    const parsed = bulkPriceListItemsSchema.safeParse(body);
    if (!parsed.success) return fail(400, "Validation failed");

    try {
      const result = await bulkUpdatePriceListItems({
        orgId: user.orgId,
        priceListId: id,
        userId: user.userId,
        userName: user.name,
        itemIds: parsed.data.itemIds,
        mode: parsed.data.mode,
        value: parsed.data.value,
        allowBelowFloor: canOverridePriceFloor(user, parsed.data.allowBelowFloor),
      });
      return ok(result);
    } catch (e: unknown) {
      if (e instanceof PriceListItemError) return fail(e.statusCode, e.message);
      throw e;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Bulk update failed";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    return fail(status, message);
  }
}

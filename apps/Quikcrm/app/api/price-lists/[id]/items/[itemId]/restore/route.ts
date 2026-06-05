import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import {
  PriceListItemError,
  restorePriceListItem,
} from "@/lib/services/quotes/price-list-service";

export const runtime = "nodejs";

function ok<T>(data: T): NextResponse {
  return NextResponse.json({ success: true, data });
}
function fail(status: number, error: string): NextResponse {
  return NextResponse.json({ success: false, error }, { status });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const { itemId } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "edit");

    try {
      await restorePriceListItem({
        orgId: user.orgId,
        itemId,
        userId: user.userId,
        userName: user.name,
      });
      return ok({ ok: true });
    } catch (e: unknown) {
      if (e instanceof PriceListItemError) return fail(e.statusCode, e.message);
      throw e;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to restore item";
    return fail(500, message);
  }
}

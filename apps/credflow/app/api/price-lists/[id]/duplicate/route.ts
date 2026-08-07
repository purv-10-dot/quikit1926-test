import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { duplicatePriceListSchema } from "@/lib/services/quotes/validators";
import {
  PriceListItemError,
  duplicatePriceList,
  getPriceList,
} from "@/lib/services/quotes/price-list-service";

export const runtime = "nodejs";

function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ success: true, data }, init);
}
function fail(status: number, error: string): NextResponse {
  return NextResponse.json({ success: false, error }, { status });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "create");

    const source = await getPriceList(user.orgId, id);
    if (!source) return fail(404, "Price list not found");

    const body = await req.json().catch(() => ({}));
    const parsed = duplicatePriceListSchema.safeParse(body);
    if (!parsed.success) return fail(400, "Invalid request body");

    try {
      const created = await duplicatePriceList({
        orgId: user.orgId,
        sourceId: id,
        userId: user.userId,
        userName: user.name,
        name: parsed.data.name,
      });
      return ok(created, { status: 201 });
    } catch (e: unknown) {
      if (e instanceof PriceListItemError) return fail(e.statusCode, e.message);
      throw e;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to duplicate price list";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/price-lists/:id/duplicate POST]", error);
    return fail(status, message);
  }
}

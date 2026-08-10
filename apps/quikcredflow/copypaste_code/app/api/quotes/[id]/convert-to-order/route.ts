/**
 * POST /api/quotes/[id]/convert-to-order
 *
 * Idempotent — if an order already exists for this Won quote, returns
 * the existing one (200) instead of minting a duplicate. Same retry
 * semantics as Stripe's idempotency keys, just keyed on quoteId.
 *
 * Auth: requires `quotes` module + `create` action (the rep that
 * could create the quote can also convert it). When the Orders module
 * gets its own permission row, swap to `assertModule("orders","create")`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import {
  OrderError,
  createOrderFromQuote,
} from "@/lib/services/orders/order-service";

export const runtime = "nodejs";

function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ success: true, data }, init);
}
function fail(status: number, error: string): NextResponse {
  return NextResponse.json({ success: false, error }, { status });
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "create");

    try {
      const result = await createOrderFromQuote({
        tenantId: user.tenantId,
        userId: user.userId,
        userName: user.name ?? null,
        quoteId: id,
      });
      // 201 for a fresh mint, 200 for an idempotent return of the
      // existing order. The client decides whether to celebrate or
      // just route to the existing order page.
      return ok(result, { status: result.alreadyExisted ? 200 : 201 });
    } catch (e: unknown) {
      if (e instanceof OrderError) return fail(e.statusCode, e.message);
      throw e;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to convert quote to order";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/quotes/:id/convert-to-order POST]", error);
    return fail(status, message);
  }
}

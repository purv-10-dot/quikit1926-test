import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { listOrdersQuerySchema } from "@/lib/services/orders/validators";
import { listOrders } from "@/lib/services/orders/order-service";
import { toNumber } from "@/lib/services/quotes/decimal";

export const runtime = "nodejs";

function ok<T>(data: T): NextResponse {
  return NextResponse.json({ success: true, data });
}
function fail(status: number, error: string): NextResponse {
  return NextResponse.json({ success: false, error }, { status });
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    // Order viewing piggybacks on the `quotes` permission for now — same
    // user persona, same dataset. When we split, change to "orders".
    await assertModule(user, "quotes", "view");

    const { searchParams } = new URL(req.url);
    const parsed = listOrdersQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return fail(
        400,
        "Invalid query: " +
          parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }

    const result = await listOrders({
      tenantId: user.tenantId,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      status: parsed.data.status,
      accountId: parsed.data.accountId,
      q: parsed.data.q,
      trashed: parsed.data.trashed,
    });

    return ok({
      items: result.items.map((it) => ({
        ...it,
        grandTotal: toNumber(it.grandTotal),
      })),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list orders";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/orders GET]", error);
    return fail(status, message);
  }
}

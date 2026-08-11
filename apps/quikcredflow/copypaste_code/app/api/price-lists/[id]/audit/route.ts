import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { pageSchema, pageSizeSchema } from "@/lib/validators/pagination";
import { z } from "zod";
import { listPriceListAudit } from "@/lib/services/quotes/price-list-audit";
import { getPriceList } from "@/lib/services/quotes/price-list-service";

export const runtime = "nodejs";

const querySchema = z.object({
  page: pageSchema,
  pageSize: pageSizeSchema,
});

function ok<T>(data: T): NextResponse {
  return NextResponse.json({ success: true, data });
}
function fail(status: number, error: string): NextResponse {
  return NextResponse.json({ success: false, error }, { status });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "view");

    const pl = await getPriceList(user.tenantId, id);
    if (!pl) return fail(404, "Price list not found");

    const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) return fail(400, "Invalid pagination");

    const result = await listPriceListAudit({
      tenantId: user.tenantId,
      priceListId: id,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
    });
    return ok(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load audit log";
    return fail(500, message);
  }
}

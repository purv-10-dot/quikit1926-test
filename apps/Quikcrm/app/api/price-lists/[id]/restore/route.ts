import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { restorePriceList } from "@/lib/services/quotes/price-list-service";

export const runtime = "nodejs";

function ok<T>(data: T): NextResponse {
  return NextResponse.json({ success: true, data });
}
function fail(status: number, error: string): NextResponse {
  return NextResponse.json({ success: false, error }, { status });
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "delete");

    const existing = await db.crmPriceList.findFirst({
      where: { id, orgId: user.orgId, deletedAt: { not: null } },
      select: { id: true },
    });
    if (!existing) {
      return fail(404, "Price list not found in trash");
    }

    await restorePriceList({
      orgId: user.orgId,
      id,
      userId: user.userId,
      userName: user.name,
    });
    return ok({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to restore price list";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/price-lists/:id/restore POST]", error);
    return fail(status, message);
  }
}

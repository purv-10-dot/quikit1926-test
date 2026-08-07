import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { getQuote, restoreQuote } from "@/lib/services/quotes/quote-service";

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

    const existing = await getQuote(user.orgId, id);
    if (!existing || !existing.deletedAt) {
      return fail(404, "Quote not found in trash");
    }

    await restoreQuote(user.orgId, id);
    return ok({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to restore quote";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/quotes/:id/restore POST]", error);
    return fail(status, message);
  }
}

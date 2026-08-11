import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { QuoteError, cloneQuote } from "@/lib/services/quotes/quote-service";

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
      const created = await cloneQuote({
        tenantId: user.tenantId,
        userId: user.userId,
        userName: user.name ?? null,
        id,
      });
      return ok(created, { status: 201 });
    } catch (e: unknown) {
      if (e instanceof QuoteError) return fail(e.statusCode, e.message);
      throw e;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to clone quote";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/quotes/:id/clone POST]", error);
    return fail(status, message);
  }
}

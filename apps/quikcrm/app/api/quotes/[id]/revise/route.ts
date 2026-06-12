import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { QuoteError, reviseQuote } from "@/lib/services/quotes/quote-service";

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
    await assertModule(user, "quotes", "edit");

    const body = (await req.json().catch(() => null)) as { notes?: string } | null;

    try {
      const created = await reviseQuote({
        orgId: user.orgId,
        userId: user.userId,
        userName: user.name ?? null,
        id,
        notes: body?.notes ?? null,
      });
      return ok(created, { status: 201 });
    } catch (e: unknown) {
      if (e instanceof QuoteError) return fail(e.statusCode, e.message);
      throw e;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to revise quote";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/quotes/:id/revise POST]", error);
    return fail(status, message);
  }
}

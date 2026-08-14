import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { getQuote, permanentDeleteQuote } from "@/lib/services/quotes/quote-service";

export const runtime = "nodejs";

const ADMIN_ROLE = "Administrator";

function ok<T>(data: T): NextResponse {
  return NextResponse.json({ success: true, data });
}
function fail(status: number, error: string): NextResponse {
  return NextResponse.json({ success: false, error }, { status });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;

    if (user.role !== ADMIN_ROLE) {
      return fail(403, "Permanent delete is restricted to administrators.");
    }

    await assertModule(user, "quotes", "delete");

    const existing = await getQuote(user.orgId, id);
    if (!existing) return fail(404, "Quote not found");
    if (!existing.deletedAt) {
      return fail(
        409,
        "Quote is not in trash. Move it to trash first, then permanently delete.",
      );
    }

    await permanentDeleteQuote(user.orgId, id);
    return ok({ ok: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to permanently delete quote";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/quotes/:id/permanent DELETE]", error);
    return fail(status, message);
  }
}

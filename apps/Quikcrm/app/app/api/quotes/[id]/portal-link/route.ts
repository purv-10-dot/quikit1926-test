import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { createQuotePortalLink } from "@/lib/services/quotes/enterprise/portal-service";
import { QuoteError } from "@/lib/services/quotes/quote-service";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "edit");

    const body = await req.json().catch(() => ({}));
    const expiresInDays =
      typeof body === "object" && body && "expiresInDays" in body
        ? Number((body as { expiresInDays: unknown }).expiresInDays)
        : 30;

    const origin =
      req.headers.get("origin") ??
      (req as NextRequest & { nextUrl?: { origin?: string } }).nextUrl?.origin ??
      "";

    const data = await createQuotePortalLink({
      orgId: user.orgId,
      quoteId: id,
      userId: user.userId,
      expiresInDays: Number.isFinite(expiresInDays) ? expiresInDays : 30,
      origin,
    });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error: unknown) {
    const status = error instanceof QuoteError ? error.statusCode : 500;
    const message = error instanceof Error ? error.message : "Portal link failed";
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

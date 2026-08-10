import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { getCpqSuggestions } from "@/lib/services/quotes/enterprise/cpq-service";
import { getQuote } from "@/lib/services/quotes/quote-service";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "view");
    const quote = await getQuote(user.tenantId, id);
    if (!quote) {
      return NextResponse.json({ success: false, error: "Quote not found" }, { status: 404 });
    }
    const productIds = quote.lines
      .map((l) => l.productId)
      .filter((pid): pid is string => !!pid);
    const suggestions = await getCpqSuggestions(user.tenantId, id, productIds);
    return NextResponse.json({ success: true, data: suggestions });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "CPQ suggestions failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

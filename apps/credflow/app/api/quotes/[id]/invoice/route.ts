import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { createInvoiceFromQuote } from "@/lib/services/quotes/enterprise/invoice-service";
import { QuoteError } from "@/lib/services/quotes/quote-service";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "edit");
    const data = await createInvoiceFromQuote({
      orgId: user.orgId,
      quoteId: id,
      userId: user.userId,
      userName: user.name ?? null,
      dueInDays: 30,
    });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error: unknown) {
    const status = error instanceof QuoteError ? error.statusCode : 500;
    const message = error instanceof Error ? error.message : "Invoice creation failed";
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

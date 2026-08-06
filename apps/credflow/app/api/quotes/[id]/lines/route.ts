import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { quoteLineInputSchema } from "@/lib/services/quotes/validators";
import { QuoteError, addQuoteLine } from "@/lib/services/quotes/quote-service";
import { toNumber } from "@/lib/services/quotes/decimal";

export const runtime = "nodejs";

function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ success: true, data }, init);
}
function fail(status: number, error: string, fieldErrors?: Record<string, string>): NextResponse {
  return NextResponse.json(
    { success: false, error, ...(fieldErrors ? { fieldErrors } : {}) },
    { status },
  );
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "edit");

    const body = await req.json().catch(() => null);
    const parsed = quoteLineInputSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        400,
        "Validation failed",
        parsed.error.flatten().fieldErrors as Record<string, string>,
      );
    }

    try {
      const created = await addQuoteLine({
        tenantId: user.tenantId,
        quoteId: id,
        input: {
          productId: parsed.data.productId ?? null,
          productName: parsed.data.productName,
          sku: parsed.data.sku ?? null,
          hsnCode: parsed.data.hsnCode ?? null,
          description: parsed.data.description ?? null,
          quantity: parsed.data.quantity,
          unit: parsed.data.unit,
          unitPrice: parsed.data.unitPrice,
          discountPct: parsed.data.discountPct,
          gstRate: parsed.data.gstRate,
          sortOrder: parsed.data.sortOrder,
        },
      });
      return ok(
        {
          ...created,
          quantity: toNumber(created.quantity),
          unitPrice: toNumber(created.unitPrice),
          discountPct: toNumber(created.discountPct),
          gstRate: toNumber(created.gstRate),
          lineTotal: toNumber(created.lineTotal),
        },
        { status: 201 },
      );
    } catch (e: unknown) {
      if (e instanceof QuoteError) {
        return fail(e.statusCode, e.message);
      }
      throw e;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to add line";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/quotes/:id/lines POST]", error);
    return fail(status, message);
  }
}

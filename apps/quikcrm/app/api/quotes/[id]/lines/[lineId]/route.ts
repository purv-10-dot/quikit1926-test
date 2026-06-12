import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { updateQuoteLineSchema } from "@/lib/services/quotes/validators";
import {
  QuoteError,
  deleteQuoteLine,
  updateQuoteLine,
} from "@/lib/services/quotes/quote-service";
import { toNumber } from "@/lib/services/quotes/decimal";

export const runtime = "nodejs";

function ok<T>(data: T): NextResponse {
  return NextResponse.json({ success: true, data });
}
function fail(status: number, error: string, fieldErrors?: Record<string, string>): NextResponse {
  return NextResponse.json(
    { success: false, error, ...(fieldErrors ? { fieldErrors } : {}) },
    { status },
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; lineId: string }> },
) {
  try {
    const { id, lineId } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "edit");

    const body = await req.json().catch(() => null);
    const parsed = updateQuoteLineSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        400,
        "Validation failed",
        parsed.error.flatten().fieldErrors as Record<string, string>,
      );
    }

    try {
      const updated = await updateQuoteLine({
        orgId: user.orgId,
        quoteId: id,
        lineId,
        input: parsed.data,
      });
      if (!updated) return fail(404, "Line not found");
      return ok({
        ...updated,
        quantity: toNumber(updated.quantity),
        unitPrice: toNumber(updated.unitPrice),
        discountPct: toNumber(updated.discountPct),
        gstRate: toNumber(updated.gstRate),
        lineTotal: toNumber(updated.lineTotal),
      });
    } catch (e: unknown) {
      if (e instanceof QuoteError) {
        return fail(e.statusCode, e.message);
      }
      throw e;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update line";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/quotes/:id/lines/:lineId PATCH]", error);
    return fail(status, message);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; lineId: string }> },
) {
  try {
    const { id, lineId } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "edit");
    try {
      await deleteQuoteLine({
        orgId: user.orgId,
        quoteId: id,
        lineId,
      });
      return ok({ ok: true });
    } catch (e: unknown) {
      if (e instanceof QuoteError) {
        return fail(e.statusCode, e.message);
      }
      throw e;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete line";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/quotes/:id/lines/:lineId DELETE]", error);
    return fail(status, message);
  }
}

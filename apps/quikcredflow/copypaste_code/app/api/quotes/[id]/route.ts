import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { updateQuoteSchema } from "@/lib/services/quotes/validators";
import {
  QuoteError,
  getQuote,
  loadRevisionChain,
  softDeleteQuote,
  updateQuote,
} from "@/lib/services/quotes/quote-service";
import { loadPriceListItemMap } from "@/lib/services/quotes/price-list-service";
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

type LoadedQuote = NonNullable<Awaited<ReturnType<typeof getQuote>>>;
type LoadedQuoteLine = LoadedQuote["lines"][number];

function serialise(q: Awaited<ReturnType<typeof getQuote>>) {
  if (!q) return q;
  return {
    ...q,
    subtotal: toNumber(q.subtotal),
    totalLineDiscount: toNumber(q.totalLineDiscount),
    overallDiscountAmount: toNumber(q.overallDiscountAmount),
    freightAmount: toNumber(q.freightAmount),
    taxableAmount: toNumber(q.taxableAmount),
    cgstAmount: toNumber(q.cgstAmount),
    sgstAmount: toNumber(q.sgstAmount),
    igstAmount: toNumber(q.igstAmount),
    roundOffAmount: toNumber(q.roundOffAmount),
    grandTotal: toNumber(q.grandTotal),
    lines: q.lines.map((l: LoadedQuoteLine) => ({
      ...l,
      quantity: toNumber(l.quantity),
      unitPrice: toNumber(l.unitPrice),
      discountPct: toNumber(l.discountPct),
      discountAmount: toNumber(l.discountAmount),
      taxableAmount: toNumber(l.taxableAmount),
      gstRate: toNumber(l.gstRate),
      cgstAmount: toNumber(l.cgstAmount),
      sgstAmount: toNumber(l.sgstAmount),
      igstAmount: toNumber(l.igstAmount),
      lineTotal: toNumber(l.lineTotal),
    })),
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "view");
    const q = await getQuote(user.tenantId, id);
    if (!q) return fail(404, "Quote not found");

    // If this quote is bound to a price list, fetch the list's items so
    // the Quote Builder's "Add line" modal can resolve the segmented
    // unit price + discount client-side without an extra round-trip per
    // line. Empty array when no list is set — the client falls back to
    // product default prices. Decimal → number coercion is handled
    // inside the service.
    const priceListItems = q.priceListId
      ? await loadPriceListItemMap(user.tenantId, q.priceListId)
      : [];

    // Revision chain (audit finding W-10). Walks parent links to surface
    // V1 → V2 → V3 history alongside the quote. Cheap because chains are
    // shallow (typically <5 versions even on heavily-negotiated deals).
    const revisionChain = await loadRevisionChain(user.tenantId, q.id, q.parentQuoteId);

    return ok({
      ...serialise(q),
      priceListItems,
      revisionChain,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load quote";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/quotes/:id GET]", error);
    return fail(status, message);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "edit");

    const body = await req.json().catch(() => null);
    const parsed = updateQuoteSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        400,
        "Validation failed",
        parsed.error.flatten().fieldErrors as Record<string, string>,
      );
    }

    try {
      const updated = await updateQuote({
        tenantId: user.tenantId,
        id,
        input: parsed.data,
      });
      return ok(serialise(updated));
    } catch (e: unknown) {
      if (e instanceof QuoteError) {
        return fail(e.statusCode, e.message);
      }
      throw e;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update quote";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/quotes/:id PATCH]", error);
    return fail(status, message);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "delete");

    const existing = await getQuote(user.tenantId, id);
    if (!existing) return fail(404, "Quote not found");
    await softDeleteQuote(user.tenantId, id);
    return ok({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete quote";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/quotes/:id DELETE]", error);
    return fail(status, message);
  }
}

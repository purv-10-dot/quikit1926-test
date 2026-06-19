import { requirePurchaseAction } from "@/lib/auth/requirePurchaseAction";
import { NextRequest, NextResponse } from "next/server";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { saveVendorQuote } from "@/lib/purchase/rfq-repository";

/**
 * POST /api/purchase/rfqs/:id/vendors/:vendorRowId/quote
 *
 * Save the rates this vendor quoted against an RFQ. The route
 * receives `{ rates: [{ lineId, rate }], remarks? }` and persists
 * them onto the matching `cn_rfq_vendors` row. The repo bumps the
 * parent RFQ to `status = quoted` once every vendor has quoted at
 * least one line.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; vendorRowId: string } },
) {
  const ctxOrResp = await requirePurchaseAction("construction.rfq", "edit");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "purchase.quote_analysis", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for purchase.quote_analysis`, 403);
  }

  const body = await req.json().catch(() => ({}));
  const rates = Array.isArray(body?.rates) ? body.rates : [];
  if (rates.length === 0) {
    return NextResponse.json(
      { error: "At least one quoted rate is required" },
      { status: 400 },
    );
  }

  const updated = await saveVendorQuote({
    orgId: ctx.orgId,
    rfqId: params.id,
    vendorRowId: params.vendorRowId,
    rates,
    remarks: typeof body?.remarks === "string" ? body.remarks : null,
    updatedBy: ctx.userId,
  });

  if (!updated) {
    return NextResponse.json(
      { error: "Vendor row or RFQ not found" },
      { status: 404 },
    );
  }
  return NextResponse.json(updated);
}

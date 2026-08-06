import { requirePurchaseAction } from "@/lib/auth/requirePurchaseAction";
import { NextRequest, NextResponse } from "next/server";

import { findRfqById } from "@/lib/purchase/rfq-repository";
import { buildRfqPreviewPdfForVendor } from "@/lib/purchase/rfq-email";

/**
 * GET /api/purchase/rfqs/[id]/preview/pdf?rowId=<rfqVendorRowId>
 * GET /api/purchase/rfqs/[id]/preview/pdf?vendorId=<vendorId>  (legacy)
 *
 * Streams the per-vendor RFQ PDF exactly as it would be attached to
 * the vendor email. Returned as `application/pdf` with `inline`
 * disposition so the client can render it in an iframe.
 *
 * `rowId` (the `Rfq_vendors` row id) is the preferred, unbiguous way
 * to identify which recipient's PDF to build — the same vendor can be
 * added to an RFQ more than once (different item subsets / different
 * T&C per row), and `vendorId` alone can't tell those rows apart.
 * `vendorId` is kept for callers with no specific row in hand (e.g.
 * the list page's PDF action), matching the FIRST row for that vendor.
 *
 * 404 if the target row/vendor isn't on the RFQ or has no assigned items.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requirePurchaseAction("construction.rfq", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const rfq = await findRfqById(ctx.orgId, params.id);
  if (!rfq) return NextResponse.json({ error: "RFQ not found" }, { status: 404 });

  const rfqVendors = (
    rfq as { vendors?: Array<{ id?: string | null; vendorId?: string | null }> }
  ).vendors;
  const rowId = req.nextUrl.searchParams.get("rowId");
  const vendorId =
    req.nextUrl.searchParams.get("vendorId") ||
    (!rowId && Array.isArray(rfqVendors)
      ? rfqVendors.find((v) => v?.vendorId)?.vendorId ?? null
      : null);
  if (!rowId && !vendorId) {
    return NextResponse.json(
      { error: "This RFQ has no vendor to preview" },
      { status: 404 },
    );
  }

  const pdf = await buildRfqPreviewPdfForVendor(ctx.orgId, rfq, { rowId, vendorId });
  if (!pdf) {
    return NextResponse.json(
      { error: "Vendor not on RFQ or has no assigned items" },
      { status: 404 },
    );
  }

  const safeNo = String(rfq.rfqNumber ?? "rfq").replace(/[^A-Za-z0-9_-]+/g, "_");
  const filename = `${safeNo}-preview.pdf`;

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

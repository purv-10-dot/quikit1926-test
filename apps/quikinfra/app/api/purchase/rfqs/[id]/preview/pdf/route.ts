import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
import { findRfqById } from "@/lib/purchase/rfq-repository";
import { buildRfqPreviewPdfForVendor } from "@/lib/purchase/rfq-email";

/**
 * GET /api/purchase/rfqs/[id]/preview/pdf?vendorId=<id>
 *
 * Streams the per-vendor RFQ PDF exactly as it would be attached to
 * the vendor email. Returned as `application/pdf` with `inline`
 * disposition so the client can render it in an iframe.
 *
 * 404 if vendorId isn't attached to the RFQ or has no assigned items.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const vendorId = req.nextUrl.searchParams.get("vendorId");
  if (!vendorId) {
    return NextResponse.json({ error: "vendorId is required" }, { status: 400 });
  }

  const rfq = await findRfqById(ctx.orgId, params.id);
  if (!rfq) return NextResponse.json({ error: "RFQ not found" }, { status: 404 });

  const pdf = await buildRfqPreviewPdfForVendor(ctx.orgId, rfq, vendorId);
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

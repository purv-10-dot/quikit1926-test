import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
import { findPOById } from "@/lib/purchase/po-repository";
import { buildPoPreviewPdf } from "@/lib/purchase/po-email";

/**
 * GET /api/purchase/orders/[id]/preview/pdf
 *
 * Streams the PO PDF exactly as `sendPoEmailToVendor` would attach
 * it to the vendor email. Returned as `application/pdf` with an
 * `inline` disposition so the client can render it in an iframe.
 * 404 if the PO has no vendor or no line items.
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctx = await getTenantContext();
  if (!ctx)
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const po = await findPOById(ctx.orgId, params.id);
  if (!po) return NextResponse.json({ error: "PO not found" }, { status: 404 });

  const pdf = await buildPoPreviewPdf(ctx.orgId, po);
  if (!pdf) {
    return NextResponse.json(
      { error: "PO has no vendor or no line items to preview" },
      { status: 404 },
    );
  }

  const safeNo = String(po.poNumber ?? "po").replace(/[^A-Za-z0-9_-]+/g, "_");
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeNo}-preview.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

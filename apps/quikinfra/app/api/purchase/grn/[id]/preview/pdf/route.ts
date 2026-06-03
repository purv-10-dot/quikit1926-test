import { requirePurchaseAction } from "@/lib/auth/requirePurchaseAction";
import { NextResponse } from "next/server";

import { findGRNById } from "@/lib/purchase/grn-repository";
import { generateGrnPdf, type GrnPdfLine } from "@/lib/purchase/grn-pdf";

/**
 * GET /api/purchase/grn/[id]/preview/pdf
 *
 * Streams the GRN PDF (letterhead + line table + total + remarks) as
 * `application/pdf` with an `inline` disposition so the client can open
 * it in a new tab. 404 if the GRN has no line items.
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requirePurchaseAction("construction.grn", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const grn = await findGRNById(ctx.orgId, params.id);
  if (!grn) return NextResponse.json({ error: "GRN not found" }, { status: 404 });

  const lines = Array.isArray(grn.lines) ? grn.lines : [];
  if (lines.length === 0) {
    return NextResponse.json(
      { error: "GRN has no line items to preview" },
      { status: 404 },
    );
  }

  const items: GrnPdfLine[] = lines.map((l: any) => {
    const desc = l.itemName || l.itemCode || l.itemId || "—";
    return {
      description: desc,
      uom: String(l.uomCode || ""),
      receivedQty: parseFloat(String(l.receivedQty ?? "0")) || 0,
      acceptedQty: parseFloat(String(l.acceptedQty ?? "0")) || 0,
      rejectedQty: parseFloat(String(l.rejectedQty ?? "0")) || 0,
      unitRate: parseFloat(String(l.unitRate ?? "0")) || 0,
      amount: parseFloat(String(l.amount ?? "0")) || 0,
    };
  });

  const totalExGst = items.reduce((s, l) => s + l.amount, 0);

  const pdf = await generateGrnPdf({
    grn: {
      grnNumber: grn.grnNumber ?? "",
      grnDate: grn.grnDate ?? "",
      poNumber: grn.poNumber ?? null,
      projectName: grn.projectName ?? null,
      supplierInvoiceNo: grn.supplierInvoiceNo ?? grn.vendorInvoiceNo ?? null,
      supplierInvoiceDate: grn.supplierInvoiceDate ?? grn.vendorInvoiceDate ?? null,
      challanNo: grn.challanNo ?? null,
      challanDate: grn.challanDate ?? null,
      vehicleNo: grn.vehicleNo ?? null,
      receivedByName: grn.receivedByName ?? null,
      remarks: grn.remarks ?? null,
    },
    vendor: {
      vendorName: grn.vendorName ?? "",
      gstin: grn.vendorGSTIN ?? null,
    },
    items,
    totalExGst,
  });

  const safeNo = String(grn.grnNumber ?? "grn").replace(/[^A-Za-z0-9_-]+/g, "_");
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeNo}-preview.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

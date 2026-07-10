import { requirePurchaseAction } from "@/lib/auth/requirePurchaseAction";
import { NextResponse } from "next/server";

import { findIndentById } from "@/lib/purchase/indent-repository";
import { procurementByIndentLine } from "@/lib/purchase/procurement-status";
import { generateIndentPdf, type IndentPdfLine } from "@/lib/purchase/indent-pdf";
import type { LineProcurement } from "@/lib/purchase/procurement-types";

/**
 * GET /api/purchase/indents/[id]/preview/pdf
 *
 * Streams the Purchase Indent PDF (letterhead + line table) inline. Each
 * line carries its PO/GRN procurement status — "have we ordered this?" /
 * "has it arrived?" — traced indent line → PO line → GRN line.
 */

interface IndentLineRow {
  id?: string;
  itemName?: string | null;
  itemCode?: string | null;
  itemId?: string | null;
  uomCode?: string | null;
  qtyRequested?: number | string | null;
  quantity?: number | string | null;
  qtyOpen?: number | string | null;
  requiredQty?: number | string | null;
  indentedQty?: number | string | null;
  estimatedRate?: number | string | null;
  unitRate?: number | string | null;
  estimatedAmount?: number | string | null;
  amount?: number | string | null;
}

function num(...vals: Array<number | string | null | undefined>): number {
  for (const v of vals) {
    if (v === null || v === undefined || String(v).trim() === "") continue;
    const n = parseFloat(String(v));
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function poText(p: LineProcurement | null): string {
  if (!p || p.poRefs.length === 0) return "Not ordered";
  return p.poRefs.map((r) => r.poNumber).join(", ");
}

function grnText(p: LineProcurement | null): string {
  if (!p) return "—";
  if (p.grnStatus === "received") return "Received";
  if (p.grnStatus === "partial") return "Partial";
  return p.poStatus === "ordered" ? "Awaiting" : "—";
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requirePurchaseAction("construction.indent", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const indent = await findIndentById(ctx.orgId, params.id);
  if (!indent || indent.status === "inactive") {
    return NextResponse.json({ error: "Indent not found" }, { status: 404 });
  }

  const lines: IndentLineRow[] = Array.isArray(indent.lines) ? indent.lines : [];
  if (lines.length === 0) {
    return NextResponse.json(
      { error: "Indent has no line items to preview" },
      { status: 404 },
    );
  }

  const procByLine = await procurementByIndentLine(
    ctx.orgId,
    lines.map((l) => l.id ?? "").filter(Boolean),
  );

  const items: IndentPdfLine[] = lines.map((l) => {
    const qty = num(l.qtyRequested, l.quantity, l.qtyOpen, l.requiredQty, l.indentedQty);
    const rate = num(l.estimatedRate, l.unitRate);
    const amount = num(l.estimatedAmount, l.amount) || qty * rate;
    const proc = (l.id && procByLine.get(l.id)) || null;
    return {
      description: l.itemName || l.itemCode || l.itemId || "—",
      uom: String(l.uomCode || ""),
      qty,
      unitRate: rate,
      amount,
      poText: poText(proc),
      grnText: grnText(proc),
    };
  });

  const totalExGst = items.reduce((s, l) => s + l.amount, 0);

  const pdf = await generateIndentPdf({
    indent: {
      indentNumber: indent.indentNumber ?? "",
      indentDate: indent.indentDate ?? "",
      requiredDate: indent.requiredDate ?? null,
      sourceMrNumber: indent.sourceMrNumber ?? null,
      projectName: indent.projectName ?? null,
      status: indent.status ?? null,
    },
    items,
    totalExGst,
  });

  const safeNo = String(indent.indentNumber ?? "indent").replace(
    /[^A-Za-z0-9_-]+/g,
    "_",
  );
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeNo}-preview.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

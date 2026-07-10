import { requirePurchaseAction } from "@/lib/auth/requirePurchaseAction";
import { NextResponse } from "next/server";

import { findPRById } from "@/lib/purchase/pr-repository";
import { procurementByPrLine } from "@/lib/purchase/procurement-status";
import { resolveUserNames } from "@/lib/users/resolve-names";
import { generatePrPdf, type PrPdfLine } from "@/lib/purchase/pr-pdf";
import type { LineProcurement } from "@/lib/purchase/procurement-types";

/**
 * GET /api/purchase/requisitions/[id]/preview/pdf
 *
 * Streams the Purchase Requisition PDF (letterhead + line table) inline.
 * Each line carries its PO/GRN procurement status — "have we ordered
 * this?" / "has it arrived?" — traced PR line → indent → PO → GRN.
 */

interface PrLineRow {
  id?: string;
  itemName?: string | null;
  itemCode?: string | null;
  itemId?: string | null;
  uomCode?: string | null;
  quantity?: number | string | null;
  qtyRequired?: number | string | null;
  qtyRequested?: number | string | null;
  orderedQty?: number | string | null;
  estimatedRate?: number | string | null;
  unitRate?: number | string | null;
  rate?: number | string | null;
  estimatedAmount?: number | string | null;
  amount?: number | string | null;
  totalAmount?: number | string | null;
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
  const ctxOrResp = await requirePurchaseAction("construction.pr", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const pr = await findPRById(ctx.orgId, params.id);
  if (!pr) {
    return NextResponse.json({ error: "Requisition not found" }, { status: 404 });
  }

  const lines: PrLineRow[] = Array.isArray(pr.lines) ? pr.lines : [];
  if (lines.length === 0) {
    return NextResponse.json(
      { error: "Requisition has no line items to preview" },
      { status: 404 },
    );
  }

  // Resolve PO/GRN status per line, plus the requester's display name.
  const procByLine = await procurementByPrLine(
    ctx.orgId,
    lines.map((l) => l.id ?? "").filter(Boolean),
  );
  const requesterId: string | null =
    (pr as { requestedById?: string | null }).requestedById ??
    (pr as { createdBy?: string | null }).createdBy ??
    null;
  const nameById = requesterId
    ? await resolveUserNames([requesterId])
    : new Map<string, string>();

  const items: PrPdfLine[] = lines.map((l) => {
    const qty = num(l.quantity, l.qtyRequired, l.qtyRequested, l.orderedQty);
    const rate = num(l.estimatedRate, l.unitRate, l.rate);
    const amount =
      num(l.estimatedAmount, l.amount, l.totalAmount) || qty * rate;
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

  const pdf = await generatePrPdf({
    pr: {
      prNumber: pr.prNumber ?? pr.mrNumber ?? "",
      prDate: pr.requestDate ?? "",
      requiredDate: pr.requiredDate ?? null,
      projectName: pr.projectName ?? null,
      purpose: pr.purpose ?? null,
      status: pr.status ?? null,
      requestedByName: requesterId
        ? nameById.get(requesterId) ?? null
        : null,
    },
    items,
    totalExGst,
  });

  const safeNo = String(pr.prNumber ?? pr.mrNumber ?? "requisition").replace(
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

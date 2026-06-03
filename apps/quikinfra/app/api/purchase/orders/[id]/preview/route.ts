import { requirePurchaseAction } from "@/lib/auth/requirePurchaseAction";
import { NextResponse } from "next/server";

import { findPOById } from "@/lib/purchase/po-repository";
import { buildPoPreview } from "@/lib/purchase/po-email";

/**
 * GET /api/purchase/orders/[id]/preview
 *
 * Returns the email-preview payload the submit-confirm modal renders
 * — subject, rendered HTML body, per-line item list, and any skip
 * reason. Uses the same resolution logic as the real send path so
 * the preview matches what the vendor would receive. PDF is served
 * separately via `/preview/pdf`.
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requirePurchaseAction("construction.po", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const po = await findPOById(ctx.orgId, params.id);
  if (!po) return NextResponse.json({ error: "PO not found" }, { status: 404 });

  const preview = await buildPoPreview(ctx.orgId, po);
  return NextResponse.json(preview);
}

import { requirePurchaseAction } from "@/lib/auth/requirePurchaseAction";
import { NextResponse } from "next/server";

import { findRfqById } from "@/lib/purchase/rfq-repository";
import { buildRfqPreview } from "@/lib/purchase/rfq-email";

/**
 * GET /api/purchase/rfqs/[id]/preview
 *
 * Returns the email preview payload — subject, per-vendor HTML body,
 * items list, and any skip reasons. Uses the same resolution logic as
 * the actual send path so the preview matches what vendors would
 * receive. PDFs are served separately via `/preview/pdf`.
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requirePurchaseAction("construction.rfq", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const rfq = await findRfqById(ctx.orgId, params.id);
  if (!rfq) return NextResponse.json({ error: "RFQ not found" }, { status: 404 });

  const preview = await buildRfqPreview(ctx.orgId, rfq);
  return NextResponse.json(preview);
}

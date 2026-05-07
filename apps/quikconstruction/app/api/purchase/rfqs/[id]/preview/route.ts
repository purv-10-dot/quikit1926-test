import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
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
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const rfq = await findRfqById(ctx.tenantId, params.id);
  if (!rfq) return NextResponse.json({ error: "RFQ not found" }, { status: 404 });

  const preview = await buildRfqPreview(ctx.tenantId, rfq);
  return NextResponse.json(preview);
}

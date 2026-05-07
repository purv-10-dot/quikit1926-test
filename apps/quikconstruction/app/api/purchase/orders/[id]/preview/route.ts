import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
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
  const ctx = await getTenantContext();
  if (!ctx)
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const po = await findPOById(ctx.tenantId, params.id);
  if (!po) return NextResponse.json({ error: "PO not found" }, { status: 404 });

  const preview = await buildPoPreview(ctx.tenantId, po);
  return NextResponse.json(preview);
}

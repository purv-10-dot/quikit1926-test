/**
 * DELETE /api/settings/sales-cost/tools/[id]/price/[priceId]
 *
 * Remove one price version. Deleting a superseded version changes what past
 * months resolve to, so this is offered only as a correction path for a mistaken
 * entry — the normal way to reprice is POST .../price, which closes the old
 * version and preserves it.
 *
 * Admin-only (Super Admin / Org Admin / CRM Administrator).
 */
import { NextResponse, type NextRequest } from "next/server";
import { isResponse } from "@/lib/auth/require";
import { requireSalesCostAdmin, salesCostError } from "@/lib/api/sales-cost-auth";
import { deleteToolPrice } from "@/lib/services/sales-cost/sales-cost-service";

export const runtime = "nodejs";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; priceId: string } },
) {
  try {
    const user = await requireSalesCostAdmin();
    if (isResponse(user)) return user;

    // Scoped on orgId AND toolId, so neither a foreign org's id nor a priceId
    // belonging to a different tool can be deleted through this route.
    await deleteToolPrice(user.orgId, params.id, params.priceId);
    return NextResponse.json({ success: true, data: { id: params.priceId } });
  } catch (e) {
    return salesCostError(e);
  }
}

/**
 * DELETE /api/settings/sales-cost/salary/[id]
 *
 * Remove one salary history row. Deleting a superseded row rewrites what past
 * months resolve to, so this is offered only as a correction path for a
 * mistaken entry — the normal way to change pay is POST /salary, which closes
 * the old row and preserves it.
 *
 * Admin-only (Super Admin / Org Admin / CRM Administrator).
 */
import { NextResponse, type NextRequest } from "next/server";
import { isResponse } from "@/lib/auth/require";
import { requireSalesCostAdmin, salesCostError } from "@/lib/api/sales-cost-auth";
import { deleteSalary } from "@/lib/services/sales-cost/sales-cost-service";

export const runtime = "nodejs";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireSalesCostAdmin();
    if (isResponse(user)) return user;

    // deleteSalary filters on orgId, so an id from another org is a 404 rather
    // than a cross-tenant delete.
    await deleteSalary(user.orgId, params.id);
    return NextResponse.json({ success: true, data: { id: params.id } });
  } catch (e) {
    return salesCostError(e);
  }
}

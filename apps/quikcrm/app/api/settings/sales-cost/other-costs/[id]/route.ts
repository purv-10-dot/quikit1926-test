/**
 * PATCH  /api/settings/sales-cost/other-costs/[id]
 * DELETE /api/settings/sales-cost/other-costs/[id]
 *
 * Admin-only (Super Admin / Org Admin / CRM Administrator). Both are org-scoped
 * in the service, so an id from another org is a 404 rather than a cross-tenant
 * write.
 */
import { NextResponse, type NextRequest } from "next/server";
import { isResponse } from "@/lib/auth/require";
import { requireSalesCostAdmin, salesCostError } from "@/lib/api/sales-cost-auth";
import { otherCostUpdateSchema, toMonthDate } from "@/lib/validators/sales-cost";
import {
  deleteOtherCost,
  updateOtherCost,
} from "@/lib/services/sales-cost/sales-cost-service";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireSalesCostAdmin();
    if (isResponse(user)) return user;

    const parsed = otherCostUpdateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed",
          errors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const p = parsed.data;
    const data = await updateOtherCost(user.orgId, params.id, {
      ...(p.label !== undefined ? { label: p.label } : {}),
      ...(p.monthlyAmount !== undefined ? { monthlyAmount: p.monthlyAmount } : {}),
      ...(p.currency !== undefined ? { currency: p.currency } : {}),
      ...(p.effectiveFrom !== undefined
        ? { effectiveFrom: toMonthDate(p.effectiveFrom) }
        : {}),
      // null explicitly clears the end date; undefined leaves it alone.
      ...(p.effectiveTo !== undefined
        ? { effectiveTo: p.effectiveTo ? toMonthDate(p.effectiveTo) : null }
        : {}),
      ...(p.active !== undefined ? { active: p.active } : {}),
      ...(p.notes !== undefined ? { notes: p.notes ?? null } : {}),
    });

    return NextResponse.json({ success: true, data });
  } catch (e) {
    return salesCostError(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireSalesCostAdmin();
    if (isResponse(user)) return user;

    await deleteOtherCost(user.orgId, params.id);
    return NextResponse.json({ success: true, data: { id: params.id } });
  } catch (e) {
    return salesCostError(e);
  }
}

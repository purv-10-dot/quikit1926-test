/**
 * GET  /api/settings/sales-cost/other-costs?userId=<id>
 * POST /api/settings/sales-cost/other-costs
 *
 * Recurring sales costs that are neither salary nor a tool — travel budget,
 * lead-list purchases, incentive pool. Entered as a monthly figure and
 * effective-dated like everything else in this module.
 *
 * Admin-only (Super Admin / Org Admin / CRM Administrator).
 */
import { NextResponse, type NextRequest } from "next/server";
import { isResponse } from "@/lib/auth/require";
import { requireSalesCostAdmin, salesCostError } from "@/lib/api/sales-cost-auth";
import { otherCostCreateSchema, toMonthDate } from "@/lib/validators/sales-cost";
import { currentPeriod } from "@/lib/services/sales-cost/period";
import {
  createOtherCost,
  listOtherCosts,
} from "@/lib/services/sales-cost/sales-cost-service";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireSalesCostAdmin();
    if (isResponse(user)) return user;

    const userId = new URL(req.url).searchParams.get("userId") ?? undefined;
    const data = await listOtherCosts(user.orgId, { userId });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    return salesCostError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireSalesCostAdmin();
    if (isResponse(user)) return user;

    const parsed = otherCostCreateSchema.safeParse(await req.json().catch(() => null));
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
    const data = await createOtherCost(
      user.orgId,
      {
        userId: p.userId,
        label: p.label,
        monthlyAmount: p.monthlyAmount,
        currency: p.currency,
        effectiveFrom: p.effectiveFrom ? toMonthDate(p.effectiveFrom) : currentPeriod().start,
        effectiveTo: p.effectiveTo ? toMonthDate(p.effectiveTo) : null,
        active: p.active,
        notes: p.notes ?? null,
      },
      user.userId,
    );

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (e) {
    return salesCostError(e);
  }
}

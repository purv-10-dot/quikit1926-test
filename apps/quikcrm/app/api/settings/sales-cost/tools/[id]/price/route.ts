/**
 * POST /api/settings/sales-cost/tools/[id]/price
 *
 * Set a tool's price from a given month onward — the ONLY way to change what a
 * tool costs.
 *
 * This is an upsert-by-effect, not an update: the service closes the currently
 * open price version at the new start month and inserts a new one. A tool that
 * goes ₹8,000 → ₹10,000 in September therefore keeps reporting ₹8,000 for
 * August, whenever the change was entered. Same contract as
 * POST /api/settings/sales-cost/salary.
 *
 * Admin-only (Super Admin / Org Admin / CRM Administrator).
 */
import { NextResponse, type NextRequest } from "next/server";
import { isResponse } from "@/lib/auth/require";
import { requireSalesCostAdmin, salesCostError } from "@/lib/api/sales-cost-auth";
import { toolPriceSchema, toMonthDate } from "@/lib/validators/sales-cost";
import { currentPeriod } from "@/lib/services/sales-cost/period";
import { setToolPrice } from "@/lib/services/sales-cost/sales-cost-service";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireSalesCostAdmin();
    if (isResponse(user)) return user;

    const parsed = toolPriceSchema.safeParse(await req.json().catch(() => null));
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
    const data = await setToolPrice(
      user.orgId,
      params.id,
      {
        cost: p.cost,
        billingFrequency: p.billingFrequency,
        currency: p.currency,
        // Default to the current month when the admin does not pick one.
        effectiveFrom: p.effectiveFrom ? toMonthDate(p.effectiveFrom) : currentPeriod().start,
        notes: p.notes ?? null,
      },
      user.userId,
    );

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (e) {
    return salesCostError(e);
  }
}

/**
 * POST /api/settings/sales-cost/salary
 *
 * Set a sales rep's monthly salary, effective from a given month.
 *
 * This is an upsert-by-effect, not an update: the service closes the currently
 * open salary row at the new start month and inserts a new one, so a report for
 * an earlier month keeps resolving to the salary that was in force then. See
 * setRepSalary in lib/services/sales-cost/sales-cost-service.ts.
 *
 * Admin-only (Super Admin / Org Admin / CRM Administrator).
 */
import { NextResponse, type NextRequest } from "next/server";
import { isResponse } from "@/lib/auth/require";
import { requireSalesCostAdmin, salesCostError } from "@/lib/api/sales-cost-auth";
import { salaryUpsertSchema, toMonthDate } from "@/lib/validators/sales-cost";
import { currentPeriod } from "@/lib/services/sales-cost/period";
import { setRepSalary } from "@/lib/services/sales-cost/sales-cost-service";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await requireSalesCostAdmin();
    if (isResponse(user)) return user;

    const parsed = salaryUpsertSchema.safeParse(await req.json().catch(() => null));
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

    const { userId, monthlyAmount, currency, effectiveFrom, notes } = parsed.data;

    const data = await setRepSalary(
      user.orgId,
      {
        userId,
        monthlyAmount,
        currency,
        // Default to the current month when the admin does not pick one.
        effectiveFrom: effectiveFrom ? toMonthDate(effectiveFrom) : currentPeriod().start,
        notes: notes ?? null,
      },
      user.userId,
    );

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (e) {
    return salesCostError(e);
  }
}

/**
 * GET  /api/settings/sales-cost/tools?userId=<id>   — list tools (optionally one rep's)
 * POST /api/settings/sales-cost/tools               — add a tool + its allocations
 *
 * A tool holds its TOTAL cost; who pays is expressed only by its allocations, so
 * a shared ₹16,000 seat split 50/50 charges ₹8,000 to each rep and is never
 * double-counted. The service rejects an allocation set that would exceed 100%
 * for any overlapping period.
 *
 * Admin-only (Super Admin / Org Admin / CRM Administrator).
 */
import { NextResponse, type NextRequest } from "next/server";
import { isResponse } from "@/lib/auth/require";
import { requireSalesCostAdmin, salesCostError } from "@/lib/api/sales-cost-auth";
import { toolCreateSchema, toMonthDate } from "@/lib/validators/sales-cost";
import { parsePeriod } from "@/lib/services/sales-cost/period";
import { createTool, listTools } from "@/lib/services/sales-cost/sales-cost-service";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireSalesCostAdmin();
    if (isResponse(user)) return user;

    const url = new URL(req.url);
    const userId = url.searchParams.get("userId") ?? undefined;
    const periodParam = url.searchParams.get("period");

    // `period` is optional here: without it the caller gets each tool's full
    // price history but no `currentPrice`. A malformed value is still a 400
    // rather than a silent fall back to "no period".
    // parsePeriod returns null for a malformed key; normalise to undefined so
    // "no period requested" and "period requested" stay distinguishable.
    const period = periodParam ? parsePeriod(periodParam) : null;
    if (periodParam && !period) {
      return NextResponse.json(
        { success: false, error: "Invalid period. Expected YYYY-MM." },
        { status: 400 },
      );
    }

    const data = await listTools(user.orgId, { userId, period: period ?? undefined });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    return salesCostError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireSalesCostAdmin();
    if (isResponse(user)) return user;

    const parsed = toolCreateSchema.safeParse(await req.json().catch(() => null));
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
    const data = await createTool(
      user.orgId,
      {
        name: p.name,
        vendor: p.vendor ?? null,
        category: p.category ?? null,
        cost: p.cost,
        billingFrequency: p.billingFrequency,
        currency: p.currency,
        startDate: toMonthDate(p.startDate),
        endDate: p.endDate ? toMonthDate(p.endDate) : null,
        active: p.active,
        notes: p.notes ?? null,
        allocations: p.allocations.map((a) => ({
          userId: a.userId,
          percentage: a.percentage,
          effectiveFrom: a.effectiveFrom ? toMonthDate(a.effectiveFrom) : undefined,
          effectiveTo: a.effectiveTo ? toMonthDate(a.effectiveTo) : null,
        })),
      },
      user.userId,
    );

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (e) {
    return salesCostError(e);
  }
}

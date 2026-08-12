/**
 * PATCH  /api/settings/sales-cost/tools/[id] — edit tool identity / allocations
 * DELETE /api/settings/sales-cost/tools/[id] — remove a tool (children cascade)
 *
 * PATCH does NOT accept cost / billingFrequency / currency: those are versioned
 * on CrmSalesToolPrice and change only through
 * POST /api/settings/sales-cost/tools/[id]/price, which closes the current
 * version and opens a new one so past months keep their original price.
 *
 * Admin-only (Super Admin / Org Admin / CRM Administrator). Both operations are
 * org-scoped in the service, so an id belonging to another org is a 404 rather
 * than a cross-tenant write.
 */
import { NextResponse, type NextRequest } from "next/server";
import { isResponse } from "@/lib/auth/require";
import { requireSalesCostAdmin, salesCostError } from "@/lib/api/sales-cost-auth";
import { toolUpdateSchema, toMonthDate } from "@/lib/validators/sales-cost";
import { deleteTool, updateTool } from "@/lib/services/sales-cost/sales-cost-service";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireSalesCostAdmin();
    if (isResponse(user)) return user;

    const parsed = toolUpdateSchema.safeParse(await req.json().catch(() => null));
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
    const data = await updateTool(
      user.orgId,
      params.id,
      {
        ...(p.name !== undefined ? { name: p.name } : {}),
        ...(p.vendor !== undefined ? { vendor: p.vendor ?? null } : {}),
        ...(p.category !== undefined ? { category: p.category ?? null } : {}),
        ...(p.startDate !== undefined ? { startDate: toMonthDate(p.startDate) } : {}),
        // `endDate: null` explicitly clears the end date, so undefined and null
        // must stay distinguishable here.
        ...(p.endDate !== undefined
          ? { endDate: p.endDate ? toMonthDate(p.endDate) : null }
          : {}),
        ...(p.active !== undefined ? { active: p.active } : {}),
        ...(p.notes !== undefined ? { notes: p.notes ?? null } : {}),
        ...(p.allocations !== undefined
          ? {
              allocations: p.allocations.map((a) => ({
                userId: a.userId,
                percentage: a.percentage,
                effectiveFrom: a.effectiveFrom ? toMonthDate(a.effectiveFrom) : undefined,
                effectiveTo: a.effectiveTo ? toMonthDate(a.effectiveTo) : null,
              })),
            }
          : {}),
      },
      user.userId,
    );

    return NextResponse.json({ success: true, data });
  } catch (e) {
    return salesCostError(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireSalesCostAdmin();
    if (isResponse(user)) return user;

    await deleteTool(user.orgId, params.id);
    return NextResponse.json({ success: true, data: { id: params.id } });
  } catch (e) {
    return salesCostError(e);
  }
}

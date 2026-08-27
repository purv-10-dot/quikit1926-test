/**
 * GET   /api/settings/sales-cost/connects-config — read Upwork Connects pricing
 * PATCH /api/settings/sales-cost/connects-config — update it
 *
 * Backs the "Upwork Connects Pricing" dialog on Settings → Sales Cost. The
 * values are org-level configuration (package size, package price, currency,
 * USD→INR rate), persisted in the shared workspace-settings blob — see
 * lib/services/sales-cost/connects-config.ts for why that store was reused.
 *
 * Admin-only via `requireSalesCostAdmin`, the same gate every other Sales Cost
 * route uses: this changes what future costs are calculated at, so it belongs
 * with salaries and tools rather than with general settings.
 *
 * PATCH is a partial merge — sending only `packagePriceUsd` leaves the rate and
 * package size untouched.
 */
import { NextResponse, type NextRequest } from "next/server";
import { isResponse } from "@/lib/auth/require";
import { requireSalesCostAdmin, salesCostError } from "@/lib/api/sales-cost-auth";
import {
  getUpworkConnectsConfig,
  setUpworkConnectsConfig,
  upworkConnectsConfigSchema,
} from "@/lib/services/sales-cost/connects-config";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireSalesCostAdmin();
    if (isResponse(user)) return user;

    const data = await getUpworkConnectsConfig(user.orgId);
    return NextResponse.json({ success: true, data });
  } catch (e) {
    return salesCostError(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireSalesCostAdmin();
    if (isResponse(user)) return user;

    // `.partial()` so a caller may send any subset; the service merges over the
    // stored values and re-validates the whole object before writing.
    const parsed = upworkConnectsConfigSchema
      .partial()
      .safeParse(await req.json().catch(() => null));
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

    const data = await setUpworkConnectsConfig(user.orgId, parsed.data);
    return NextResponse.json({ success: true, data });
  } catch (e) {
    return salesCostError(e);
  }
}

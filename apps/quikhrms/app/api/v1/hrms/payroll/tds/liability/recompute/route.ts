import { NextRequest } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { refreshLiabilityForPeriod } from "@/lib/services/tds-liability";

/**
 * Manually refresh one (or all) TDS liability periods for the current FY.
 * Body: { year?: number, month?: number }
 *   - If both year + month given → refresh that single period
 *   - If neither → refresh the current FY's 12 months (Apr–Mar)
 */
export const POST = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { year, month } = body as { year?: number; month?: number };

    if (year != null && month != null) {
      const res = await refreshLiabilityForPeriod(orgId, year, month);
      return successResponse({ refreshed: 1, result: res });
    }

    if (year != null || month != null) {
      return validationError("Provide both year and month, or neither");
    }

    // Default — refresh the current FY (Apr–Mar)
    const today = new Date();
    const isAfterApril = today.getUTCMonth() >= 3;
    const fyStartYear = isAfterApril ? today.getUTCFullYear() : today.getUTCFullYear() - 1;
    const periods: { year: number; month: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const m = ((i + 3) % 12) + 1; // 4,5,6...3
      const y = i < 9 ? fyStartYear : fyStartYear + 1;
      periods.push({ year: y, month: m });
    }
    for (const p of periods) {
      await refreshLiabilityForPeriod(orgId, p.year, p.month);
    }
    return successResponse({ refreshed: periods.length });
  } catch (e) {
    console.error("POST /payroll/tds/liability/recompute error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

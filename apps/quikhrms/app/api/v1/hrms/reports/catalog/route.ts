import { NextRequest } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { reportCatalog } from "@/lib/reports/registry";

/** GET /api/v1/hrms/reports/catalog — reports the CALLER may run (grouped client-side). */
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  try {
    // Filter to the caller's runnable reports so sensitive report names
    // (CTC Breakup, Statutory IDs & Bank Details) don't leak to everyone.
    return successResponse(reportCatalog(ctx.permissions));
  } catch (e) {
    console.error("GET /reports/catalog error:", e);
    return internalError();
  }
}, {
  requiredPermissions: ["hrms.reports.read", "hrms.reports.manage", "hrms.audit.read"],
  anyPermission: true,
});

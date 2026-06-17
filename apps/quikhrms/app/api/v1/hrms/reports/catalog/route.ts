import { NextRequest } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { reportCatalog } from "@/lib/reports/registry";

/** GET /api/v1/hrms/reports/catalog — list of all available reports (grouped client-side). */
export const GET = withAuth(async (_req: NextRequest) => {
  try {
    return successResponse(reportCatalog());
  } catch (e) {
    console.error("GET /reports/catalog error:", e);
    return internalError();
  }
});

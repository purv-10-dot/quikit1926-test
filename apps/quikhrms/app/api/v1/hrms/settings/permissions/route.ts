import { NextRequest } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { PERMISSIONS } from "@/lib/rbac/permissions";

/**
 * GET /api/v1/hrms/settings/permissions — return the static permission catalog.
 *
 * In RBAC v2 there is no Permission DB table; permissions are
 * (resource, action) string pairs derived from this in-code registry.
 */
export const GET = withAuth(async (_req: NextRequest) => {
  try {
    return successResponse(PERMISSIONS);
  } catch (error) {
    console.error("GET /settings/permissions error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.rbac.manage", "hrms.settings.read"], anyPermission: true });

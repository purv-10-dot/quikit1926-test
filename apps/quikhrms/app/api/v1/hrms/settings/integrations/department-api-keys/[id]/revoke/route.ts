import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, internalError } from "@/lib/api-response";

/** Revoke an external API key — instant, no redeploy. Kept (not hard-deleted) for audit history. */
export const POST = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const result = await prisma.$executeRaw`
      UPDATE "app_quikhrms"."ExternalApiKey"
      SET "isActive" = false, "revokedAt" = now()
      WHERE id = ${params.id} AND "orgId" = ${orgId} AND "isActive" = true`;
    if (result === 0) return notFound("Active key not found");
    return successResponse({ id: params.id, isActive: false });
  } catch (error) {
    console.error("POST /settings/integrations/department-api-keys/:id/revoke error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

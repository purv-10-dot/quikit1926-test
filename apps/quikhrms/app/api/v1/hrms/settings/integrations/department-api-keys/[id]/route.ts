import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError } from "@/lib/api-response";

/**
 * Permanently remove a revoked key row (cleanup — Revoke alone only disables
 * it). Requires the key to already be revoked, so an active/in-use key can't
 * be wiped without the deliberate stop-it-first step.
 */
export const DELETE = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const existing = await prisma.$queryRaw<{ id: string; isActive: boolean }[]>`
      SELECT id, "isActive" FROM "app_quikhrms"."ExternalApiKey"
      WHERE id = ${params.id} AND "orgId" = ${orgId}
      LIMIT 1`;
    const row = existing[0];
    if (!row) return notFound("Key not found");
    if (row.isActive) return validationError("Revoke this key before deleting it");

    await prisma.$executeRaw`DELETE FROM "app_quikhrms"."ExternalApiKey" WHERE id = ${params.id} AND "orgId" = ${orgId}`;
    return successResponse({ id: params.id, deleted: true });
  } catch (error) {
    console.error("DELETE /settings/integrations/department-api-keys/:id error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

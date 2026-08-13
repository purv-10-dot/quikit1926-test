import { NextRequest } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { generateExternalApiKey } from "@/lib/services/external-api-key";

interface ExternalApiKeyRow {
  id: string;
  label: string;
  keyPrefix: string;
  isActive: boolean;
  createdAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
}

/**
 * Self-service API keys for read-only cross-app integrations (e.g. quikscale
 * reading this org's Department list). One org, its own keys — the org's own
 * Settings admin manages these, not QuikIT engineering. Table isn't in the
 * generated Prisma client yet, so this reads/writes via raw SQL (see
 * packages/database/prisma/schema.prisma → ExternalApiKey).
 */
export const GET = withAuth(async (_req: NextRequest, { orgId }) => {
  try {
    const rows = await prisma.$queryRaw<ExternalApiKeyRow[]>`
      SELECT id, label, "keyPrefix", "isActive", "createdAt", "revokedAt", "lastUsedAt"
      FROM "app_quikhrms"."ExternalApiKey"
      WHERE "orgId" = ${orgId}
      ORDER BY "createdAt" DESC`;
    return successResponse(rows);
  } catch (error) {
    console.error("GET /settings/integrations/department-api-keys error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.read", "hrms.settings.write"], anyPermission: true });

const createSchema = z.object({ label: z.string().min(1, "Label is required").max(100) });

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const { raw, hash, prefix } = generateExternalApiKey();
    const id = crypto.randomUUID();

    await prisma.$executeRaw`
      INSERT INTO "app_quikhrms"."ExternalApiKey" (id, "orgId", label, "keyHash", "keyPrefix", "isActive", "createdBy", "createdAt")
      VALUES (${id}, ${orgId}, ${parsed.data.label}, ${hash}, ${prefix}, true, ${userId}, now())`;

    // The raw key is shown exactly once — it's never retrievable again after this response.
    return successResponse({ id, label: parsed.data.label, keyPrefix: prefix, isActive: true, apiKey: raw }, undefined, 201);
  } catch (error) {
    console.error("POST /settings/integrations/department-api-keys error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

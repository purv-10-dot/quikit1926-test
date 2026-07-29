import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";

// Editable Relieving / Experience letter bodies. Stored in new CompanySettings
// columns read/written via raw SQL (not in the generated client). The type maps
// to a whitelisted column name — never interpolate arbitrary input.
const COLUMN: Record<string, string> = {
  relieving: "relievingLetterBody",
  experience: "experienceLetterBody",
};

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const col = COLUMN[params.type];
    if (!col) return validationError("Unknown letter type.");
    const rows = await prisma.$queryRawUnsafe<Array<{ body: string | null }>>(
      `SELECT "${col}" AS body FROM "app_quikhrms"."CompanySettings" WHERE "orgId" = $1 LIMIT 1`,
      orgId,
    );
    return successResponse({ body: rows[0]?.body ?? null });
  } catch (error) {
    console.error("GET /settings/exit-letter/[type] error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.read", "hrms.settings.write"], anyPermission: true });

const bodySchema = z.object({ body: z.string().max(20000).nullish() });

export const PUT = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const col = COLUMN[params.type];
    if (!col) return validationError("Unknown letter type.");
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    const value = parsed.data.body ?? null;

    const existing = await prisma.companySettings.findUnique({ where: { orgId }, select: { orgId: true } });
    if (!existing) {
      await prisma.companySettings.create({ data: { orgId, companyName: "Your Company", createdBy: userId, updatedBy: userId } });
    }
    await prisma.$executeRawUnsafe(
      `UPDATE "app_quikhrms"."CompanySettings" SET "${col}" = $1, "updatedBy" = $2 WHERE "orgId" = $3`,
      value, userId, orgId,
    );
    return successResponse({ body: value });
  } catch (error) {
    console.error("PUT /settings/exit-letter/[type] error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

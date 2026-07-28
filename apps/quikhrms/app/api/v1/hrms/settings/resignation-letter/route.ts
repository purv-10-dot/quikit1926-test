import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";

// The editable resignation-acceptance-letter body. Stored in a new
// CompanySettings column read/written via raw SQL (not in the generated client).

export const GET = withAuth(async (_req: NextRequest, { orgId }) => {
  try {
    const rows = await prisma.$queryRaw<{ resignationLetterBody: string | null }[]>`
      SELECT "resignationLetterBody" FROM "app_quikhrms"."CompanySettings" WHERE "orgId" = ${orgId} LIMIT 1`;
    return successResponse({ resignationLetterBody: rows[0]?.resignationLetterBody ?? null });
  } catch (error) {
    console.error("GET /settings/resignation-letter error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.read", "hrms.settings.write"], anyPermission: true });

const bodySchema = z.object({ resignationLetterBody: z.string().max(20000).nullish() });

export const PUT = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    const value = parsed.data.resignationLetterBody ?? null;

    // Ensure a settings row exists, then update the body via raw SQL.
    const existing = await prisma.companySettings.findUnique({ where: { orgId }, select: { orgId: true } });
    if (!existing) {
      await prisma.companySettings.create({ data: { orgId, companyName: "Your Company", createdBy: userId, updatedBy: userId } });
    }
    await prisma.$executeRaw`
      UPDATE "app_quikhrms"."CompanySettings"
      SET "resignationLetterBody" = ${value}, "updatedBy" = ${userId}
      WHERE "orgId" = ${orgId}`;

    return successResponse({ resignationLetterBody: value });
  } catch (error) {
    console.error("PUT /settings/resignation-letter error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

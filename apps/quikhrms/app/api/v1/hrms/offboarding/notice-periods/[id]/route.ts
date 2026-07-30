import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { updateNoticePeriodSchema } from "@/lib/validations/boarding";

// Raw SQL (not the typed `prisma.noticePeriod` model) so this runs without
// regenerating the Prisma client. Table lives in the `app_quikhrms` schema.

interface Row {
  id: string;
  name: string;
  description: string | null;
  duration: number;
  unit: string;
}

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.$queryRaw<Row[]>`
      SELECT id, name, description, duration, unit::text AS unit
      FROM "app_quikhrms"."NoticePeriod"
      WHERE id = ${params.id} AND "orgId" = ${orgId} AND "deletedAt" IS NULL
      LIMIT 1
    `;
    if (!existing.length) return notFound("Notice period not found");

    const body = await req.json();
    const parsed = updateNoticePeriodSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const prev = existing[0];
    const name = parsed.data.name ?? prev.name;
    const description = parsed.data.description !== undefined ? parsed.data.description : prev.description;
    const duration = parsed.data.duration ?? prev.duration;
    const unit = parsed.data.unit ?? prev.unit;

    await prisma.$executeRaw`
      UPDATE "app_quikhrms"."NoticePeriod"
      SET name = ${name},
          description = ${description ?? null},
          duration = ${duration},
          unit = ${unit}::"app_quikhrms"."NoticePeriodUnit",
          "updatedBy" = ${userId},
          "updatedAt" = NOW()
      WHERE id = ${params.id} AND "orgId" = ${orgId}
    `;

    return successResponse({ id: params.id, name, description: description ?? null, duration, unit });
  } catch (error) {
    console.error("PATCH /offboarding/notice-periods/:id error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.offboarding.write"] });

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const affected = await prisma.$executeRaw`
      UPDATE "app_quikhrms"."NoticePeriod"
      SET "deletedAt" = NOW(), "updatedBy" = ${userId}
      WHERE id = ${params.id} AND "orgId" = ${orgId} AND "deletedAt" IS NULL
    `;
    if (affected === 0) return notFound("Notice period not found");

    return successResponse({ deleted: true });
  } catch (error) {
    console.error("DELETE /offboarding/notice-periods/:id error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.offboarding.write"] });

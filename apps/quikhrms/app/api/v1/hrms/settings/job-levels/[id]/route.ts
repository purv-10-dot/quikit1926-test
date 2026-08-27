import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";

// NOTE: raw SQL on purpose — see route.ts for why.

const updateJobLevelSchema = z.object({
  code: z.string().trim().min(1).max(20).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  slaDays: z.number().int().min(1).max(3650).optional(),
  // Multi-Stage TAT — per-stage SLA targets. null explicitly clears it (that
  // stage's TAT stops being rated for this level).
  positionToOfferSlaDays: z.number().int().min(1).max(3650).nullable().optional(),
  sourcedToInterviewSlaDays: z.number().int().min(1).max(3650).nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

/** PATCH /api/v1/hrms/settings/job-levels/:id */
export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "app_quikhrms"."JobLevel"
      WHERE id = ${params.id} AND "orgId" = ${orgId} AND "deletedAt" IS NULL
      LIMIT 1
    `;
    if (existing.length === 0) return notFound("Job level not found");

    const body = await req.json();
    const parsed = updateJobLevelSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }
    const d = parsed.data;

    if (d.code) {
      const dupe = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "app_quikhrms"."JobLevel"
        WHERE "orgId" = ${orgId} AND "deletedAt" IS NULL AND code = ${d.code} AND id != ${params.id}
        LIMIT 1
      `;
      if (dupe.length > 0) return validationError("A level with this code already exists.");
    }

    await prisma.$executeRaw`
      UPDATE "app_quikhrms"."JobLevel"
      SET code = COALESCE(${d.code ?? null}, code),
          name = COALESCE(${d.name ?? null}, name),
          "slaDays" = COALESCE(${d.slaDays ?? null}, "slaDays"),
          "positionToOfferSlaDays" = COALESCE(${d.positionToOfferSlaDays ?? null}, "positionToOfferSlaDays"),
          "sourcedToInterviewSlaDays" = COALESCE(${d.sourcedToInterviewSlaDays ?? null}, "sourcedToInterviewSlaDays"),
          "sortOrder" = COALESCE(${d.sortOrder ?? null}, "sortOrder"),
          "isActive" = COALESCE(${d.isActive ?? null}, "isActive"),
          "updatedBy" = ${userId},
          "updatedAt" = NOW()
      WHERE id = ${params.id} AND "orgId" = ${orgId}
    `;

    return successResponse({ id: params.id, ...d });
  } catch (error) {
    console.error("PATCH /settings/job-levels/:id error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

/** DELETE /api/v1/hrms/settings/job-levels/:id — blocked while any requisition still uses it */
export const DELETE = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const existing = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "app_quikhrms"."JobLevel"
      WHERE id = ${params.id} AND "orgId" = ${orgId} AND "deletedAt" IS NULL
      LIMIT 1
    `;
    if (existing.length === 0) return notFound("Job level not found");

    const inUse = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM "app_quikhrms"."JobRequisition"
      WHERE "jobLevelId" = ${params.id} AND "deletedAt" IS NULL
    `;
    const count = Number(inUse[0]?.count ?? 0);
    if (count > 0) {
      return validationError(`This level is used by ${count} requisition(s). Reassign them first.`);
    }

    await prisma.$executeRaw`
      UPDATE "app_quikhrms"."JobLevel" SET "deletedAt" = NOW() WHERE id = ${params.id} AND "orgId" = ${orgId}
    `;

    return successResponse({ id: params.id });
  } catch (error) {
    console.error("DELETE /settings/job-levels/:id error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

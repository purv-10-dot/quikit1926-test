import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";

// NOTE: raw SQL (not `prisma.jobLevel`) on purpose — JobLevel is a brand-new
// table not yet in the generated Prisma client. Same pattern as NoticePeriod.

interface Row {
  id: string;
  code: string;
  name: string;
  slaDays: number;
  positionToOfferSlaDays: number | null;
  sourcedToInterviewSlaDays: number | null;
  sortOrder: number;
  isActive: boolean;
  requisitionCount: number;
}

const createJobLevelSchema = z.object({
  code: z.string().trim().min(1, "Code required").max(20),
  name: z.string().trim().min(1, "Name required").max(120),
  slaDays: z.number().int().min(1, "SLA days required").max(3650),
  // Multi-Stage TAT — per-stage SLA targets. Optional: null = that stage's
  // TAT isn't rated for this level.
  positionToOfferSlaDays: z.number().int().min(1).max(3650).nullish(),
  sourcedToInterviewSlaDays: z.number().int().min(1).max(3650).nullish(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

/** GET /api/v1/hrms/settings/job-levels — list, ordered for the picker + settings table */
export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const includeInactive = searchParams.get("includeInactive") === "1";

    const rows = await prisma.$queryRaw<Row[]>`
      SELECT jl.id, jl.code, jl.name, jl."slaDays",
             jl."positionToOfferSlaDays", jl."sourcedToInterviewSlaDays",
             jl."sortOrder", jl."isActive",
             COALESCE(cnt.c, 0)::int AS "requisitionCount"
      FROM "app_quikhrms"."JobLevel" jl
      LEFT JOIN (
        SELECT "jobLevelId", COUNT(*)::int AS c
        FROM "app_quikhrms"."JobRequisition"
        WHERE "deletedAt" IS NULL AND "jobLevelId" IS NOT NULL
        GROUP BY "jobLevelId"
      ) cnt ON cnt."jobLevelId" = jl.id
      WHERE jl."orgId" = ${orgId} AND jl."deletedAt" IS NULL
        AND (${includeInactive} OR jl."isActive" = true)
      ORDER BY jl."sortOrder" ASC, jl."slaDays" ASC
    `;

    const data = rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      slaDays: r.slaDays,
      positionToOfferSlaDays: r.positionToOfferSlaDays,
      sourcedToInterviewSlaDays: r.sourcedToInterviewSlaDays,
      sortOrder: r.sortOrder,
      isActive: r.isActive,
      _count: { requisitions: r.requisitionCount },
    }));

    return successResponse(data);
  } catch (error) {
    console.error("GET /settings/job-levels error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.read", "hrms.settings.write"], anyPermission: true });

/** POST /api/v1/hrms/settings/job-levels — create a level */
export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createJobLevelSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }
    const { code, name, slaDays, positionToOfferSlaDays, sourcedToInterviewSlaDays, sortOrder, isActive } = parsed.data;

    const existing = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "app_quikhrms"."JobLevel"
      WHERE "orgId" = ${orgId} AND "deletedAt" IS NULL AND code = ${code}
      LIMIT 1
    `;
    if (existing.length > 0) {
      return validationError("A level with this code already exists.");
    }

    const id = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "app_quikhrms"."JobLevel"
        (id, "orgId", code, name, "slaDays", "positionToOfferSlaDays", "sourcedToInterviewSlaDays", "sortOrder", "isActive", "createdBy", "updatedBy", "createdAt", "updatedAt")
      VALUES
        (${id}, ${orgId}, ${code}, ${name}, ${slaDays}, ${positionToOfferSlaDays ?? null}, ${sourcedToInterviewSlaDays ?? null}, ${sortOrder ?? 0}, ${isActive ?? true}, ${userId}, ${userId}, NOW(), NOW())
    `;

    return successResponse(
      {
        id, code, name, slaDays,
        positionToOfferSlaDays: positionToOfferSlaDays ?? null, sourcedToInterviewSlaDays: sourcedToInterviewSlaDays ?? null,
        sortOrder: sortOrder ?? 0, isActive: isActive ?? true, _count: { requisitions: 0 },
      },
      undefined,
      201,
    );
  } catch (error) {
    console.error("POST /settings/job-levels error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

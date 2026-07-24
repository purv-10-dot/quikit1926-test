import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createNoticePeriodSchema } from "@/lib/validations/boarding";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";

// NOTE: this module uses raw SQL (not the typed `prisma.noticePeriod` model) on
// purpose, so it runs against the DB without regenerating the Prisma client.
// The NoticePeriod table lives in the `app_quikhrms` schema.

interface Row {
  id: string;
  name: string;
  description: string | null;
  duration: number;
  unit: string;
  employeeCount: number;
}

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const search = searchParams.get("search") ?? "";
    const pattern = `%${search}%`;
    const offset = (page - 1) * limit;

    const rows = await prisma.$queryRaw<Row[]>`
      SELECT np.id, np.name, np.description, np.duration, np.unit::text AS unit,
             COALESCE(cnt.c, 0)::int AS "employeeCount"
      FROM "app_quikhrms"."NoticePeriod" np
      LEFT JOIN (
        SELECT "noticePeriodId", COUNT(*)::int AS c
        FROM "app_quikhrms"."OffboardingInstance"
        WHERE "deletedAt" IS NULL AND "noticePeriodId" IS NOT NULL
        GROUP BY "noticePeriodId"
      ) cnt ON cnt."noticePeriodId" = np.id
      WHERE np."orgId" = ${orgId} AND np."deletedAt" IS NULL AND np.name ILIKE ${pattern}
      ORDER BY np."createdAt" ASC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const totalRows = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM "app_quikhrms"."NoticePeriod"
      WHERE "orgId" = ${orgId} AND "deletedAt" IS NULL AND name ILIKE ${pattern}
    `;
    const total = Number(totalRows[0]?.count ?? 0);

    const data = rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      duration: r.duration,
      unit: r.unit,
      _count: { offboardingInstances: r.employeeCount },
    }));

    return successResponse(data, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /offboarding/notice-periods error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.offboarding.read"] });

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createNoticePeriodSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const { name, description, duration, unit } = parsed.data;
    const id = randomUUID();

    await prisma.$executeRaw`
      INSERT INTO "app_quikhrms"."NoticePeriod"
        (id, "orgId", name, description, duration, unit, "createdBy", "updatedBy", "createdAt", "updatedAt")
      VALUES
        (${id}, ${orgId}, ${name}, ${description ?? null}, ${duration},
         ${unit}::"app_quikhrms"."NoticePeriodUnit", ${userId}, ${userId}, NOW(), NOW())
    `;

    return successResponse(
      { id, name, description: description ?? null, duration, unit, _count: { offboardingInstances: 0 } },
      undefined,
      201,
    );
  } catch (error) {
    console.error("POST /offboarding/notice-periods error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.offboarding.write"] });

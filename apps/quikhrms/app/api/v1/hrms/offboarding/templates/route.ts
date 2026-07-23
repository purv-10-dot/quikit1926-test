import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createOffboardingTemplateSchema } from "@/lib/validations/boarding";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { createAuditLog } from "@/lib/utils/audit";

// Raw SQL (not the typed `prisma.offboardingTemplate` model) so this runs
// without regenerating the Prisma client. Table is in the `app_quikhrms` schema.

interface Row {
  id: string;
  name: string;
  description: string | null;
  departmentId: string | null;
  designationId: string | null;
  tasks: unknown;
  isActive: boolean;
  createdAt: Date;
}

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const offset = (page - 1) * limit;
    const isActiveParam = searchParams.get("isActive");
    const active = isActiveParam == null ? null : isActiveParam === "true";

    const rows = await prisma.$queryRaw<Row[]>`
      SELECT id, name, description, "departmentId", "designationId", tasks, "isActive", "createdAt"
      FROM "app_quikhrms"."OffboardingTemplate"
      WHERE "orgId" = ${orgId} AND "deletedAt" IS NULL
        AND (${active}::boolean IS NULL OR "isActive" = ${active}::boolean)
      ORDER BY "createdAt" DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    const totalRows = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM "app_quikhrms"."OffboardingTemplate"
      WHERE "orgId" = ${orgId} AND "deletedAt" IS NULL
        AND (${active}::boolean IS NULL OR "isActive" = ${active}::boolean)
    `;
    const total = Number(totalRows[0]?.count ?? 0);

    return successResponse(rows, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /offboarding/templates error:", error);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createOffboardingTemplateSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const d = parsed.data;
    const id = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "app_quikhrms"."OffboardingTemplate"
        (id, "orgId", name, description, "departmentId", "designationId", tasks, "isActive", "createdBy", "updatedBy", "createdAt", "updatedAt")
      VALUES
        (${id}, ${orgId}, ${d.name}, ${d.description ?? null}, ${d.departmentId ?? null}, ${d.designationId ?? null},
         ${JSON.stringify(d.tasks)}::jsonb, ${d.isActive}, ${userId}, ${userId}, NOW(), NOW())
    `;

    await createAuditLog({ orgId, userId, action: "Create", entityType: "OffboardingTemplate", entityId: id });
    return successResponse({ id, ...d }, undefined, 201);
  } catch (error) {
    console.error("POST /offboarding/templates error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.offboarding.write"] });

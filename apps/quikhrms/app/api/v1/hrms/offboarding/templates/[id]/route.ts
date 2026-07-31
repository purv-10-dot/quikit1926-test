import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { updateOffboardingTemplateSchema } from "@/lib/validations/boarding";

// Raw SQL — table lives in the `app_quikhrms` schema, keeps this working without
// a regenerated Prisma client.

interface Row {
  id: string; name: string; description: string | null;
  departmentId: string | null; designationId: string | null; tasks: unknown; isActive: boolean;
}

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.$queryRaw<Row[]>`
      SELECT id, name, description, "departmentId", "designationId", tasks, "isActive"
      FROM "app_quikhrms"."OffboardingTemplate"
      WHERE id = ${params.id} AND "orgId" = ${orgId} AND "deletedAt" IS NULL
      LIMIT 1
    `;
    if (!existing.length) return notFound("Template not found");

    const body = await req.json();
    const parsed = updateOffboardingTemplateSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const prev = existing[0];
    const d = parsed.data;
    const name = d.name ?? prev.name;
    const description = d.description !== undefined ? d.description : prev.description;
    const departmentId = d.departmentId !== undefined ? d.departmentId : prev.departmentId;
    const designationId = d.designationId !== undefined ? d.designationId : prev.designationId;
    const tasks = d.tasks !== undefined ? d.tasks : prev.tasks;
    const isActive = d.isActive !== undefined ? d.isActive : prev.isActive;

    await prisma.$executeRaw`
      UPDATE "app_quikhrms"."OffboardingTemplate"
      SET name = ${name}, description = ${description ?? null},
          "departmentId" = ${departmentId ?? null}, "designationId" = ${designationId ?? null},
          tasks = ${JSON.stringify(tasks)}::jsonb, "isActive" = ${isActive},
          "updatedBy" = ${userId}, "updatedAt" = NOW()
      WHERE id = ${params.id} AND "orgId" = ${orgId}
    `;
    return successResponse({ id: params.id, name, description, departmentId, designationId, tasks, isActive });
  } catch (error) {
    console.error("PATCH /offboarding/templates/:id error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.offboarding.write"] });

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const affected = await prisma.$executeRaw`
      UPDATE "app_quikhrms"."OffboardingTemplate"
      SET "deletedAt" = NOW(), "updatedBy" = ${userId}
      WHERE id = ${params.id} AND "orgId" = ${orgId} AND "deletedAt" IS NULL
    `;
    if (affected === 0) return notFound("Template not found");
    return successResponse({ deleted: true });
  } catch (error) {
    console.error("DELETE /offboarding/templates/:id error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.offboarding.write"] });

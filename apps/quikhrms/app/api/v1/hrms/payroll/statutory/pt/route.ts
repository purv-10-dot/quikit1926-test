import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { upsertPTSchema } from "@/lib/validations/payroll";
import { createAuditLog } from "@/lib/utils/audit";

export const GET = withAuth(async (_req: NextRequest, { orgId }) => {
  try {
    const list = await prisma.professionalTaxConfig.findMany({ where: { orgId }, orderBy: { state: "asc" } });
    return successResponse(list);
  } catch (e) {
    console.error("GET /payroll/statutory/pt error:", e);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = upsertPTSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }
    const { state, locationId, slabs, ...rest } = parsed.data;
    const existing = await prisma.professionalTaxConfig.findFirst({
      where: { orgId, state, locationId: locationId ?? null },
    });
    const data = { ...rest, slabs: slabs as never };
    const record = existing
      ? await prisma.professionalTaxConfig.update({
          where: { id: existing.id },
          data: { ...data, updatedBy: userId },
        })
      : await prisma.professionalTaxConfig.create({
          data: { orgId, state, locationId: locationId ?? null, ...data, createdBy: userId, updatedBy: userId },
        });
    await createAuditLog({ orgId, userId, action: existing ? "Update" : "Create", entityType: "ProfessionalTaxConfig", entityId: record.id, changes: parsed.data });
    return successResponse(record);
  } catch (e) {
    console.error("POST /payroll/statutory/pt error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

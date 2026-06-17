import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError, conflict } from "@/lib/api-response";
import { upsertLegalEntitySchema } from "@/lib/validations/payroll";
import { createAuditLog } from "@/lib/utils/audit";

export const GET = withAuth(async (_req: NextRequest, { orgId }) => {
  try {
    const list = await prisma.legalEntity.findMany({
      where: { orgId, deletedAt: null },
      orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
    });
    return successResponse(list);
  } catch (e) {
    console.error("GET /legal-entities error:", e);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = upsertLegalEntitySchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const dup = await prisma.legalEntity.findFirst({
      where: { orgId, code: parsed.data.code, deletedAt: null },
    });
    if (dup) return conflict("Legal entity code already exists");

    if (parsed.data.isPrimary) {
      await prisma.legalEntity.updateMany({
        where: { orgId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const record = await prisma.legalEntity.create({
      data: { orgId, ...parsed.data, createdBy: userId, updatedBy: userId },
    });
    await createAuditLog({
      orgId, userId, action: "Create", entityType: "LegalEntity", entityId: record.id,
      changes: parsed.data, request: req,
    });
    return successResponse(record, undefined, 201);
  } catch (e) {
    console.error("POST /legal-entities error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

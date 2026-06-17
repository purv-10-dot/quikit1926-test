import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { upsertLWFSchema } from "@/lib/validations/payroll";
import { createAuditLog } from "@/lib/utils/audit";

export const GET = withAuth(async (_req: NextRequest, { orgId }) => {
  try {
    const list = await prisma.lWFConfig.findMany({ where: { orgId }, orderBy: { state: "asc" } });
    return successResponse(list);
  } catch (e) {
    console.error("GET /payroll/statutory/lwf error:", e);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = upsertLWFSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }
    const record = await prisma.lWFConfig.upsert({
      where: { orgId_state: { orgId, state: parsed.data.state } },
      update: { ...parsed.data, updatedBy: userId },
      create: { orgId, ...parsed.data, createdBy: userId, updatedBy: userId },
    });
    await createAuditLog({ orgId, userId, action: "Update", entityType: "LWFConfig", entityId: record.id, changes: parsed.data });
    return successResponse(record);
  } catch (e) {
    console.error("POST /payroll/statutory/lwf error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

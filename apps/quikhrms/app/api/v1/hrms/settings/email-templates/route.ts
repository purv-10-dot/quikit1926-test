import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { upsertEmailTemplateSchema } from "@/lib/validations/payroll";
import { createAuditLog } from "@/lib/utils/audit";

export const GET = withAuth(async (_req: NextRequest, { orgId }) => {
  try {
    const list = await prisma.emailTemplate.findMany({
      where: { orgId, deletedAt: null },
      orderBy: [{ key: "asc" }, { channel: "asc" }],
    });
    return successResponse(list);
  } catch (e) {
    console.error("GET /settings/email-templates error:", e);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = upsertEmailTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }
    const record = await prisma.emailTemplate.upsert({
      where: { orgId_key_channel: { orgId, key: parsed.data.key, channel: parsed.data.channel } },
      update: {
        subject: parsed.data.subject,
        body: parsed.data.body,
        enabled: parsed.data.enabled,
        description: parsed.data.description ?? null,
        updatedBy: userId,
      },
      create: {
        orgId,
        key: parsed.data.key,
        channel: parsed.data.channel,
        subject: parsed.data.subject,
        body: parsed.data.body,
        enabled: parsed.data.enabled,
        description: parsed.data.description ?? null,
        createdBy: userId,
        updatedBy: userId,
      },
    });
    await createAuditLog({
      orgId, userId, action: "Update", entityType: "EmailTemplate", entityId: record.id,
      changes: parsed.data, request: req,
    });
    return successResponse(record);
  } catch (e) {
    console.error("POST /settings/email-templates error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { upsertEmailTemplateSchema } from "@/lib/validations/payroll";
import { createAuditLog } from "@/lib/utils/audit";
import { allowedVarNames, isKnownEmailKey } from "@/lib/email/registry";
import { findUnknownVars } from "@/lib/email/validate-vars";

// Strip active content from stored template HTML — <script>, inline event
// handlers, and javascript: URIs — so a saved template can't carry an XSS
// payload into anything that renders it (preview, in-app viewer).
function stripDangerousHtml(s: string): string {
  return s
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script\b[^>]*\/?>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}

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
}, { requiredPermissions: ["hrms.settings.read", "hrms.settings.write"], anyPermission: true });

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = upsertEmailTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    // Reject unknown events and any {{variable}} the event doesn't provide, so a
    // tenant template never renders a broken/blank token in production.
    if (!isKnownEmailKey(parsed.data.key)) {
      return validationError(`Unknown email event: "${parsed.data.key}".`);
    }
    const allowed = allowedVarNames(parsed.data.key);
    const unknown = findUnknownVars(parsed.data.subject, parsed.data.body, allowed);
    if (unknown.length) {
      return validationError(
        `Unknown variables: ${unknown.map((n) => `{{${n}}}`).join(", ")}. ` +
          `Allowed for this template: ${[...allowed].map((n) => `{{${n}}}`).join(", ")}`,
      );
    }

    const cleanSubject = stripDangerousHtml(parsed.data.subject);
    const cleanBody = stripDangerousHtml(parsed.data.body);

    const record = await prisma.emailTemplate.upsert({
      where: { orgId_key_channel: { orgId, key: parsed.data.key, channel: parsed.data.channel } },
      update: {
        subject: cleanSubject,
        body: cleanBody,
        enabled: parsed.data.enabled,
        description: parsed.data.description ?? null,
        // Revive a previously "Reset to default" (soft-deleted) template — the
        // unique (orgId,key,channel) row still exists, so saving must clear
        // deletedAt or the override stays hidden from the list.
        deletedAt: null,
        updatedBy: userId,
      },
      create: {
        orgId,
        key: parsed.data.key,
        channel: parsed.data.channel,
        subject: cleanSubject,
        body: cleanBody,
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

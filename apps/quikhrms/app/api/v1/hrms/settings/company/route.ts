import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { updateCompanySettingsSchema } from "@/lib/validations/settings";
import { getOrCreateCompanySettings } from "@/lib/services/settings";
import { markStepCompleted } from "@/lib/services/payroll";
import { createAuditLog } from "@/lib/utils/audit";

export const GET = withAuth(async (_req: NextRequest, { orgId, userId }) => {
  try {
    const settings = await getOrCreateCompanySettings(orgId, userId);
    return successResponse(settings);
  } catch (error) {
    console.error("GET /settings/company error:", error);
    return internalError();
  }
});

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    if (typeof body !== "object" || body === null) return validationError("Body required");

    const allowed: Record<string, unknown> = {};
    if ("logo" in body) {
      const v = body.logo;
      if (v !== null && typeof v !== "string") return validationError("logo must be string or null");
      if (typeof v === "string" && v && !/^https?:\/\//.test(v) && !v.startsWith("/")) {
        return validationError("logo must be absolute URL or relative path");
      }
      allowed.logo = v;
    }
    if (Object.keys(allowed).length === 0) return validationError("No supported fields");

    await getOrCreateCompanySettings(orgId, userId);
    const settings = await prisma.companySettings.update({
      where: { orgId },
      data: { ...allowed, updatedBy: userId },
    });
    await createAuditLog({
      orgId, userId, action: "Update", entityType: "CompanySettings", entityId: settings.id, changes: allowed,
    });
    return successResponse(settings);
  } catch (error) {
    console.error("PATCH /settings/company error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

export const PUT = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = updateCompanySettingsSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    await getOrCreateCompanySettings(orgId, userId);

    const settings = await prisma.companySettings.update({
      where: { orgId },
      data: { ...parsed.data, updatedBy: userId },
    });

    const orgComplete = !!(
      settings.companyName &&
      settings.addressLine1 &&
      (settings.cin || settings.gstin)
    );
    if (orgComplete) {
      try {
        await markStepCompleted(orgId, userId, "orgDetailsCompleted");
      } catch (err) {
        console.error("markStepCompleted(orgDetailsCompleted) failed:", err);
      }
    }

    await createAuditLog({
      orgId, userId, action: "Update", entityType: "CompanySettings", entityId: settings.id, changes: parsed.data,
    });

    return successResponse(settings);
  } catch (error) {
    console.error("PUT /settings/company error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, conflict, internalError } from "@/lib/api-response";
import { getOrCreateCompanySettings } from "@/lib/services/settings";
import { isValidCareerSlugFormat, isCareerSlugAvailable } from "@/lib/services/career-page";
import { createAuditLog } from "@/lib/utils/audit";

export const GET = withAuth(async (_req: NextRequest, { orgId, userId }) => {
  try {
    const settings = await getOrCreateCompanySettings(orgId, userId);
    const org = await prisma.org.findUnique({ where: { id: orgId }, select: { slug: true } });
    return successResponse({
      careerPageEnabled: settings.careerPageEnabled,
      careerPageIntro: settings.careerPageIntro,
      careerPageSlug: settings.careerPageSlug,
      companyName: settings.companyName,
      logo: settings.logo,
      orgSlug: org?.slug ?? null,
    });
  } catch (error) {
    console.error("GET /settings/career-page error:", error);
    return internalError();
  }
});

const patchSchema = z.object({
  careerPageEnabled: z.boolean().optional(),
  careerPageIntro: z.string().max(2000).nullable().optional(),
  // null clears a previously-set custom slug (falls back to the default
  // /careers/{Org.slug} link). Format checked here; global uniqueness is
  // checked separately below since Zod can't do an async DB lookup.
  careerPageSlug: z.string().min(3).max(60).nullable().optional(),
});

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    if (Object.keys(parsed.data).length === 0) return validationError("No supported fields");

    if (parsed.data.careerPageSlug) {
      const slug = parsed.data.careerPageSlug;
      if (!isValidCareerSlugFormat(slug)) {
        return validationError("Use lowercase letters, numbers and hyphens only (3-60 characters), no leading/trailing or double hyphens");
      }
      if (!(await isCareerSlugAvailable(slug, orgId))) {
        return conflict("This career page URL is already taken. Please choose another.");
      }
    }

    await getOrCreateCompanySettings(orgId, userId);
    const settings = await prisma.companySettings.update({
      where: { orgId },
      data: { ...parsed.data, updatedBy: userId },
    });
    await createAuditLog({
      orgId, userId, action: "Update", entityType: "CompanySettings", entityId: settings.id, changes: parsed.data,
    });
    return successResponse(settings);
  } catch (error) {
    console.error("PATCH /settings/career-page error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

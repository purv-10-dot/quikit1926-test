import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createOnboardingTemplateSchema } from "@/lib/validations/boarding";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { createAuditLog } from "@/lib/utils/audit";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const departmentId = searchParams.get("departmentId");
    const isActive = searchParams.get("isActive");

    const where = {
      orgId,
      deletedAt: null,
      ...(departmentId && { departmentId }),
      ...(isActive && { isActive: isActive === "true" }),
    };

    const [templates, total] = await Promise.all([
      prisma.onboardingTemplate.findMany({
        where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit,
      }),
      prisma.onboardingTemplate.count({ where }),
    ]);

    return successResponse(templates, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /onboarding/templates error:", error);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createOnboardingTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const template = await prisma.onboardingTemplate.create({
      data: {
        orgId,
        name: parsed.data.name,
        description: parsed.data.description,
        departmentId: parsed.data.departmentId ?? null,
        designationId: parsed.data.designationId ?? null,
        tasks: JSON.parse(JSON.stringify(parsed.data.tasks)),
        isActive: parsed.data.isActive,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    await createAuditLog({ orgId, userId, action: "Create", entityType: "OnboardingTemplate", entityId: template.id });
    return successResponse(template, undefined, 201);
  } catch (error) {
    console.error("POST /onboarding/templates error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.onboarding.write"] });

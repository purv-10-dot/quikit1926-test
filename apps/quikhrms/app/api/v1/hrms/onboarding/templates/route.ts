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
    // "Onboarding" (default) or "PreOnboarding". The `kind` column isn't in the
    // generated client, so annotate + filter it via a raw lookup.
    const kind = searchParams.get("kind") ?? "Onboarding";

    const where = {
      orgId,
      deletedAt: null,
      ...(departmentId && { departmentId }),
      ...(isActive && { isActive: isActive === "true" }),
    };

    const all = await prisma.onboardingTemplate.findMany({ where, orderBy: { createdAt: "desc" } });
    const kindRows = await prisma.$queryRaw<Array<{ id: string; kind: string | null }>>`
      SELECT id, kind FROM "app_quikhrms"."OnboardingTemplate" WHERE "orgId" = ${orgId} AND "deletedAt" IS NULL`;
    const kindMap = new Map(kindRows.map((r) => [r.id, r.kind ?? "Onboarding"]));
    const filtered = all
      .map((t) => ({ ...t, kind: kindMap.get(t.id) ?? "Onboarding" }))
      .filter((t) => t.kind === kind);
    const total = filtered.length;
    const paged = filtered.slice((page - 1) * limit, (page - 1) * limit + limit);

    return successResponse(paged, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /onboarding/templates error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.onboarding.read"] });

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

    // kind ("Onboarding" | "PreOnboarding") — new column, set via raw SQL.
    const kind = body?.kind === "PreOnboarding" ? "PreOnboarding" : "Onboarding";
    await prisma.$executeRaw`UPDATE "app_quikhrms"."OnboardingTemplate" SET kind = ${kind} WHERE id = ${template.id}`;

    await createAuditLog({ orgId, userId, action: "Create", entityType: "OnboardingTemplate", entityId: template.id });
    return successResponse({ ...template, kind }, undefined, 201);
  } catch (error) {
    console.error("POST /onboarding/templates error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.onboarding.write"] });

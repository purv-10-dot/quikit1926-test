import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createLeavePolicySchema } from "@/lib/validations/leave";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { invalidateLeavePolicyCache } from "@/lib/services/leave-policy-engine";

/** GET /api/v1/hrms/leaves/policies */
export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const status = searchParams.get("status");

    const where = {
      orgId,
      deletedAt: null,
      ...(status && { status: status as "Draft" | "PendingReview" | "Active" | "Archived" }),
    };

    const [policies, total] = await Promise.all([
      prisma.leavePolicy.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, name: true, version: true, status: true, description: true,
          sourceFileName: true, sourceFileType: true, sourceFileUrl: true,
          extractedAt: true, approvedAt: true, approvedBy: true,
          effectiveFrom: true, effectiveTo: true,
          appliesToDeptIds: true, appliesToRoleIds: true, appliesToEmploymentTypes: true,
          createdAt: true, updatedAt: true,
        },
      }),
      prisma.leavePolicy.count({ where }),
    ]);

    return successResponse(policies, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /leaves/policies error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.leave_policy.read"] });

/** POST /api/v1/hrms/leaves/policies — create a new policy record (no extraction yet) */
export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createLeavePolicySchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const data = parsed.data;
    const policy = await prisma.leavePolicy.create({
      data: {
        orgId,
        name: data.name,
        description: data.description,
        sourceFileUrl: data.sourceFileUrl,
        sourceFileName: data.sourceFileName,
        sourceFileType: data.sourceFileType,
        effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : undefined,
        effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : undefined,
        appliesToDeptIds: data.appliesToDeptIds ?? undefined,
        appliesToRoleIds: data.appliesToRoleIds ?? undefined,
        appliesToEmploymentTypes: data.appliesToEmploymentTypes ?? undefined,
        status: "Draft",
        createdBy: userId,
        updatedBy: userId,
      },
    });

    await invalidateLeavePolicyCache(orgId);
    return successResponse(policy, undefined, 201);
  } catch (error) {
    console.error("POST /leaves/policies error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.leave_policy.write"] });

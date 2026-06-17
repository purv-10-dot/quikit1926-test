import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError } from "@/lib/api-response";
import { updateLeavePolicySchema } from "@/lib/validations/leave";
import { invalidateLeavePolicyCache } from "@/lib/services/leave-policy-engine";

/** GET /api/v1/hrms/leaves/policies/[id] */
export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const policy = await prisma.leavePolicy.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!policy) return notFound("Policy not found");
    return successResponse(policy);
  } catch (error) {
    console.error("GET /leaves/policies/[id] error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.leave_policy.read"] });

/** PATCH /api/v1/hrms/leaves/policies/[id] */
export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const body = await req.json();
    const parsed = updateLeavePolicySchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const existing = await prisma.leavePolicy.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) return notFound("Policy not found");

    const data = parsed.data;
    const updated = await prisma.leavePolicy.update({
      where: { id: params.id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.approvedRules !== undefined && {
          approvedRules: JSON.parse(JSON.stringify(data.approvedRules)),
        }),
        ...(data.effectiveFrom !== undefined && {
          effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : null,
        }),
        ...(data.effectiveTo !== undefined && {
          effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null,
        }),
        ...(data.appliesToDeptIds !== undefined && {
          appliesToDeptIds: data.appliesToDeptIds ?? undefined,
        }),
        ...(data.appliesToRoleIds !== undefined && {
          appliesToRoleIds: data.appliesToRoleIds ?? undefined,
        }),
        ...(data.appliesToEmploymentTypes !== undefined && {
          appliesToEmploymentTypes: data.appliesToEmploymentTypes ?? undefined,
        }),
        updatedBy: userId,
      },
    });

    await invalidateLeavePolicyCache(orgId);
    return successResponse(updated);
  } catch (error) {
    console.error("PATCH /leaves/policies/[id] error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.leave_policy.write"] });

/** DELETE /api/v1/hrms/leaves/policies/[id] — soft delete */
export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.leavePolicy.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) return notFound("Policy not found");

    await prisma.leavePolicy.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), updatedBy: userId, status: "Archived" },
    });

    await invalidateLeavePolicyCache(orgId);
    return successResponse({ id: params.id });
  } catch (error) {
    console.error("DELETE /leaves/policies/[id] error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.leave_policy.write"] });

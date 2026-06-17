import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError } from "@/lib/api-response";
import { approveLeavePolicySchema } from "@/lib/validations/leave";
import { invalidateLeavePolicyCache } from "@/lib/services/leave-policy-engine";

/**
 * POST /api/v1/hrms/leaves/policies/[id]/approve
 *
 * HR signs off on the (possibly edited) extracted rules. Stores them in
 * `approvedRules` and flips status to Active. `approvedRules` is the ONLY
 * field the runtime engine reads.
 */
export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const body = await req.json();
    const parsed = approveLeavePolicySchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const existing = await prisma.leavePolicy.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: { id: true, version: true, status: true },
    });
    if (!existing) return notFound("Policy not found");

    const data = parsed.data;
    const policy = await prisma.leavePolicy.update({
      where: { id: params.id },
      data: {
        approvedRules: JSON.parse(JSON.stringify(data.approvedRules)),
        status: "Active",
        approvedBy: userId,
        approvedAt: new Date(),
        effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : existing.status === "Active" ? undefined : new Date(),
        version: existing.status === "Active" ? existing.version + 1 : existing.version,
        updatedBy: userId,
      },
    });

    await invalidateLeavePolicyCache(orgId);
    return successResponse(policy);
  } catch (error) {
    console.error("POST /leaves/policies/[id]/approve error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.leave_policy.approve"] });

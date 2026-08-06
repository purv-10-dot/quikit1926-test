import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError, forbidden } from "@/lib/api-response";
import { getActiveChainLevels, callerCanActionLevel, getCallerRoleIds } from "@/lib/services/approval-chain";
import { getCallerEmployeeId } from "@/lib/rbac/scope";
import type { ModerationModule } from "@/lib/services/content-moderation";

/**
 * GET /api/v1/hrms/engage/approvals?type=announcement|post|recognition|feedback&status=Pending
 * Returns content awaiting moderation. Requires hrms.engage.approve (for engagement types)
 * or hrms.feedback.approve (for feedback type) — OR being named as an approver
 * in Settings → Approval Chains for the module.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { orgId, permissions } = ctx;
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") ?? "announcement";
    const status = (searchParams.get("status") ?? "Pending") as "Pending" | "Approved" | "Rejected";
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);

    const isFeedback = type === "feedback";
    const requiredPerm = isFeedback ? "hrms.feedback.approve" : "hrms.engage.approve";
    let authorized = permissions.includes("*") || permissions.includes(requiredPerm);
    if (!authorized) {
      const chainModule: ModerationModule = isFeedback ? "Feedback" : "Engagement";
      const levels = await getActiveChainLevels(orgId, chainModule);
      if (levels && levels.length > 0) {
        const callerEmpId = await getCallerEmployeeId(ctx);
        const roleIds = callerEmpId ? await getCallerRoleIds(orgId, callerEmpId) : [];
        authorized = !!callerEmpId && levels.some((lv) => callerCanActionLevel(lv, { employeeId: callerEmpId, roleIds }));
      }
    }
    if (!authorized) {
      return forbidden(`Missing permission: ${requiredPerm}`);
    }

    const base = { orgId, approvalStatus: status };
    const employeeSel = { select: { id: true, firstName: true, lastName: true, profilePhoto: true, employeeCode: true } };

    if (type === "announcement") {
      const items = await prisma.announcement.findMany({
        where: { ...base, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: { author: employeeSel },
      });
      return successResponse(items);
    }
    if (type === "post") {
      const items = await prisma.socialPost.findMany({
        where: { ...base, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: { employee: employeeSel },
      });
      return successResponse(items);
    }
    if (type === "recognition") {
      const items = await prisma.recognition.findMany({
        where: base,
        orderBy: { createdAt: "desc" },
        take: limit,
        include: { fromEmployee: employeeSel, toEmployee: employeeSel },
      });
      return successResponse(items);
    }
    if (type === "feedback") {
      const items = await prisma.continuousFeedback.findMany({
        where: base,
        orderBy: { createdAt: "desc" },
        take: limit,
        include: { fromEmployee: employeeSel, toEmployee: employeeSel },
      });
      return successResponse(items);
    }

    return successResponse([]);
  } catch (error) {
    console.error("GET /engage/approvals error:", error);
    return internalError();
  }
});

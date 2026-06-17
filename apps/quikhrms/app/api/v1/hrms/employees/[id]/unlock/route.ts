import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, internalError } from "@/lib/api-response";
import { createAuditLog } from "@/lib/utils/audit";

/**
 * POST /api/v1/hrms/employees/:id/unlock
 * Admin unlock for an account locked by repeated failed logins. Clears
 * lockedUntil and resets failedLoginAttempts.
 */
export const POST = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const employee = await prisma.employee.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: { id: true, lockedUntil: true, failedLoginAttempts: true, workEmail: true },
    });
    if (!employee) return notFound("Employee not found");

    await prisma.employee.update({
      where: { id: employee.id },
      data: { lockedUntil: null, failedLoginAttempts: 0 },
    });

    await createAuditLog({
      orgId, userId, action: "Update", entityType: "Employee", entityId: employee.id,
      metadata: {
        action: "unlock-account",
        priorLockedUntil: employee.lockedUntil,
        priorFailedAttempts: employee.failedLoginAttempts,
      },
    });

    return successResponse({ id: employee.id, email: employee.workEmail, unlocked: true });
  } catch (error) {
    console.error("POST /employees/:id/unlock error:", error);
    return internalError();
  }
}, {
  requiredPermissions: ["hrms.rbac.manage"],
  rateLimit: { max: 30, windowSec: 60, by: "user", scope: "auth.unlock" },
});

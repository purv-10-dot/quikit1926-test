import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth, invalidatePermissionCache } from "@/lib/with-auth";
import { successResponse, notFound, internalError } from "@/lib/api-response";
import { hashPassword, generateTempPassword } from "@/lib/auth/password";
import { createAuditLog } from "@/lib/utils/audit";

const TEMP_PASSWORD_TTL_HOURS = 48;

/**
 * POST /api/v1/hrms/employees/:id/temp-password
 * Admin sets a temporary password for an employee. The plaintext is returned
 * ONCE for the admin to hand over; the employee is forced to change it on next
 * login. Used when email-based invites aren't viable.
 */
export const POST = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const employee = await prisma.employee.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: { id: true, workEmail: true, firstName: true, lastName: true },
    });
    if (!employee) return notFound("Employee not found");

    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);
    const expiresAt = new Date(Date.now() + TEMP_PASSWORD_TTL_HOURS * 3600 * 1000);

    await prisma.employee.update({
      where: { id: employee.id },
      // Setting a fresh temp password also clears any prior lockout so the
      // user can sign in with the new password immediately.
      data: {
        passwordHash,
        mustChangePassword: true,
        tempPasswordExpiresAt: expiresAt,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    // Force the forced-change lockout to take effect on the user's next request.
    await invalidatePermissionCache(orgId, employee.id);

    await createAuditLog({
      orgId, userId, action: "Update", entityType: "Employee", entityId: employee.id,
      metadata: { action: "set-temp-password", expiresAt }, // never log the password itself
    });

    return successResponse({
      email: employee.workEmail,
      name: `${employee.firstName} ${employee.lastName}`.trim(),
      tempPassword, // shown once to the admin
      expiresAt,
    });
  } catch (error) {
    console.error("POST /employees/:id/temp-password error:", error);
    return internalError();
  }
}, {
  requiredPermissions: ["hrms.rbac.manage"],
  rateLimit: { max: 20, windowSec: 60 * 60, by: "user", scope: "auth.temp-password" },
});

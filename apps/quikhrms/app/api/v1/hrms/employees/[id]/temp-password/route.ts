import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth, invalidatePermissionCache } from "@/lib/with-auth";
import { successResponse, notFound, forbidden, internalError } from "@/lib/api-response";
import { hashPassword, generateTempPassword } from "@/lib/auth/password";
import { createAuditLog } from "@/lib/utils/audit";
import { joinCode } from "@/lib/rbac/registry";

const TEMP_PASSWORD_TTL_HOURS = 48;

/**
 * POST /api/v1/hrms/employees/:id/temp-password
 * Admin sets a temporary password for an employee. The plaintext is returned
 * ONCE for the admin to hand over; the employee is forced to change it on next
 * login. Used when email-based invites aren't viable.
 */
export const POST = withAuth(async (_req: NextRequest, { orgId, userId, permissions }, params) => {
  try {
    const employee = await prisma.employee.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: { id: true, workEmail: true, firstName: true, lastName: true },
    });
    if (!employee) return notFound("Employee not found");

    // Takeover guard: a non-super admin must not reset the password of a
    // more-privileged user (e.g. reset the admin, then log in as them). Block
    // if the target holds the admin role or any permission the caller lacks.
    if (!permissions.includes("*")) {
      const targetRoles = await prisma.hrmsUserAppRole.findMany({
        where: { orgId, userId: params.id },
        select: { role: { select: { name: true, permissions: { select: { resource: true, action: true } } } } },
      });
      const targetIsAdmin = targetRoles.some((r) => r.role?.name?.toLowerCase() === "admin");
      const held = new Set(permissions);
      const exceeds = targetRoles.some((r) =>
        (r.role?.permissions ?? []).some((p) => !held.has(joinCode(p.resource, p.action))),
      );
      if (targetIsAdmin || exceeds) {
        return forbidden("You can't reset the password of a user with higher privileges than your own.");
      }
    }

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

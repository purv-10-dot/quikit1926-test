import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, conflict, internalError } from "@/lib/api-response";
import { provisionCentralInvite } from "@/lib/services/invitation";
import { createAuditLog } from "@/lib/utils/audit";

/**
 * POST /api/v1/hrms/employees/:id/invite
 *
 * Sends the portal invitation for an existing employee — the single manual
 * entry point for invites (used by the "Not yet invited" list on the Users &
 * Invitations screen). Provisions the person centrally (creates the login
 * account + emails the set-password link) and links Employee.authUserId, so the
 * employee moves out of the invitable list into Pending Invitations.
 */
export const POST = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const employee = await prisma.employee.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: {
        id: true, firstName: true, lastName: true, workEmail: true, authUserId: true,
        departmentId: true, designationId: true, reportingManagerId: true,
      },
    });
    if (!employee) return notFound("Employee not found");
    if (!employee.workEmail) return validationError("This employee has no work email to invite.");
    if (employee.authUserId) return conflict("This employee already has a login account.");

    // Invite with the employee's currently-assigned HRMS role (empty → org default).
    const roleRow = await prisma.hrmsUserAppRole.findFirst({
      where: { orgId, userId: employee.id },
      select: { roleId: true },
    });

    const invite = await provisionCentralInvite({
      orgId,
      invitedBy: userId,
      email: employee.workEmail,
      firstName: employee.firstName,
      lastName: employee.lastName,
      employeeId: employee.id,
      roleIds: roleRow?.roleId ? [roleRow.roleId] : [],
      departmentId: employee.departmentId,
      designationId: employee.designationId,
      managerId: employee.reportingManagerId,
    });
    if (!invite.ok) return internalError(invite.error ?? "Could not send the invitation.");

    await createAuditLog({
      orgId, userId, action: "Create", entityType: "Invitation", entityId: employee.id,
      metadata: { email: employee.workEmail, source: "users-tab" },
    });

    return successResponse({ invited: true, email: employee.workEmail });
  } catch (error) {
    console.error("POST /employees/[id]/invite error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.user.invite"] });

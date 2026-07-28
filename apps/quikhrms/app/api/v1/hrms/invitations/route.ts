import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, conflict, internalError, serviceUnavailable } from "@/lib/api-response";
import { createInvitationSchema } from "@/lib/validations/invitation";
import { createAuditLog } from "@/lib/utils/audit";
import { provisionCentralInvite } from "@/lib/services/invitation";
import { joinCode } from "@/lib/rbac/registry";

/** Display status: a Pending invite past its expiry reads as Expired. */
function effectiveStatus(status: string, expiresAt: Date): string {
  if (status === "Pending" && expiresAt.getTime() < Date.now()) return "Expired";
  return status;
}

/** GET /api/v1/hrms/invitations — list invitations for the tenant. */
export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const statusFilter = req.nextUrl.searchParams.get("status");

    const invitations = await prisma.invitation.findMany({
      where: { orgId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });

    // Reconcile stale invites. Acceptance happens in central QuikIT (a separate
    // DB), so the local Invitation row never flips to Accepted on its own — it
    // lingers as "Pending" even after the person becomes an active, provisioned
    // employee, showing a duplicate (Active member + Pending invite). Here we
    // detect any pending invite whose email now belongs to a provisioned
    // employee (authUserId or passwordHash set), mark it Accepted, and hide it
    // from the list so only the active member remains.
    const pendingEmails = [...new Set(
      invitations.filter((i) => i.status === "Pending").map((i) => i.email.toLowerCase()),
    )];
    let acceptedEmails = new Set<string>();
    if (pendingEmails.length) {
      const emps = await prisma.employee.findMany({
        where: {
          orgId, deletedAt: null,
          OR: pendingEmails.map((e) => ({ workEmail: { equals: e, mode: "insensitive" as const } })),
        },
        select: { workEmail: true, authUserId: true, passwordHash: true },
      });
      acceptedEmails = new Set(
        emps.filter((e) => e.authUserId != null || e.passwordHash != null)
          .map((e) => e.workEmail.toLowerCase()),
      );
      const toAccept = invitations.filter(
        (i) => i.status === "Pending" && acceptedEmails.has(i.email.toLowerCase()),
      );
      if (toAccept.length) {
        await prisma.invitation.updateMany({
          where: { id: { in: toAccept.map((i) => i.id) } },
          data: { status: "Accepted", acceptedAt: new Date() },
        }).catch(() => { /* best-effort; still filtered from the response below */ });
      }
    }

    // Resolve role + inviter names for display.
    const roleIds = [...new Set(invitations.flatMap((i) => i.roleIds))];
    const inviterIds = [...new Set(invitations.map((i) => i.invitedBy))];
    const [roles, inviters] = await Promise.all([
      prisma.hrmsAppRole.findMany({ where: { id: { in: roleIds } }, select: { id: true, name: true } }),
      prisma.employee.findMany({ where: { id: { in: inviterIds } }, select: { id: true, firstName: true, lastName: true } }),
    ]);
    const roleName = new Map(roles.map((r) => [r.id, r.name]));
    const inviterName = new Map(inviters.map((e) => [e.id, `${e.firstName} ${e.lastName}`.trim()]));

    const shaped = invitations
      // Hide invites already fulfilled by a provisioned employee — the active
      // member row represents them now, so showing the invite too is a duplicate.
      .filter((i) => !acceptedEmails.has(i.email.toLowerCase()))
      .map((i) => ({
        id: i.id,
        email: i.email,
        firstName: i.firstName,
        lastName: i.lastName,
        roleIds: i.roleIds,
        roleNames: i.roleIds.map((id) => roleName.get(id) ?? id),
        status: effectiveStatus(i.status, i.expiresAt),
        invitedByName: inviterName.get(i.invitedBy) ?? null,
        expiresAt: i.expiresAt,
        acceptedAt: i.acceptedAt,
        createdAt: i.createdAt,
      }))
      .filter((i) => (statusFilter ? i.status === statusFilter : true));

    return successResponse(shaped);
  } catch (error) {
    console.error("GET /invitations error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.user.invite"] });

/** POST /api/v1/hrms/invitations — create an invitation + email the link. */
export const POST = withAuth(async (req: NextRequest, { orgId, userId, permissions }) => {
  try {
    const body = await req.json();
    const parsed = createInvitationSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const data = parsed.data;
    const email = data.email.trim().toLowerCase();

    // Block if an active employee already owns this email.
    const existingEmployee = await prisma.employee.findFirst({
      where: { orgId, deletedAt: null, workEmail: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });
    if (existingEmployee) return conflict("An employee with this email already exists");

    // Block duplicate pending invite — admin should resend instead.
    const existingInvite = await prisma.invitation.findFirst({
      where: { orgId, deletedAt: null, status: "Pending", email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });
    if (existingInvite) return conflict("A pending invitation already exists for this email");

    // Validate the supplied roles belong to this tenant.
    const roleRows = await prisma.hrmsAppRole.findMany({
      where: { id: { in: data.roleIds }, orgId: orgId },
      select: { id: true, permissions: { select: { resource: true, action: true } } },
    });
    if (roleRows.length !== data.roleIds.length) return validationError("One or more roles are invalid");

    // Tier guard: you can't invite someone into a role that carries permissions
    // you don't hold yourself (mirrors PUT /employees/:id/role). super_admin ("*")
    // may grant anything.
    if (!permissions.includes("*")) {
      const held = new Set(permissions);
      const missing = [...new Set(
        roleRows.flatMap((r) => r.permissions.map((p) => joinCode(p.resource, p.action))).filter((c) => !held.has(c)),
      )];
      if (missing.length) {
        return validationError(`You can't grant roles carrying permissions you don't hold: ${missing.join(", ")}`);
      }
    }

    // Provision directly against central QuikIT (creates the User + OrgMember +
    // UserAppAccess and sends the onboarding invite email) and record the local
    // Invitation row. Same as QuikScale's in-app invite — no HTTP hop.
    const invite = await provisionCentralInvite({
      orgId,
      invitedBy: userId,
      email,
      firstName: data.firstName,
      lastName: data.lastName,
      roleIds: data.roleIds,
      invitationMethod: data.invitationMethod,
      departmentId: data.departmentId ?? null,
      designationId: data.designationId ?? null,
      managerId: data.managerId ?? null,
    });
    if (!invite.ok) return validationError(invite.error ?? "Could not provision the invite centrally");

    await createAuditLog({
      orgId, userId, action: "Create", entityType: "Invitation", entityId: email,
      metadata: { email, roleIds: data.roleIds, method: data.invitationMethod, centralUserId: invite.userId },
    });

    return successResponse(
      { email, status: "Pending", emailSent: invite.ok },
      undefined,
      201,
    );
  } catch (error) {
    console.error("POST /invitations error:", error);
    return internalError();
  }
}, {
  requiredPermissions: ["hrms.user.invite"],
  rateLimit: { max: 60, windowSec: 60, by: "user", scope: "invitations.create" },
});

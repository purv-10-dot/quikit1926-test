import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, conflict, internalError, serviceUnavailable } from "@/lib/api-response";
import { createInvitationSchema } from "@/lib/validations/invitation";
import { generateInviteToken, inviteExpiry } from "@/lib/auth/invite-token";
import { dispatchInvitationEmail } from "@/lib/services/invitation";
import { createAuditLog } from "@/lib/utils/audit";
import { provisionMemberRemote } from "@/lib/auth/provision-member-remote";
import { deprovisionMemberRemote } from "@/lib/auth/deprovision-member-remote";

/** App slug HRMS is registered under in the central QuikIT app registry. */
const QUIKHRMS_APP_SLUG = "quikhrms";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
/** Central QuikIT base — hosts the /invitations/accept set-password flow. */
const QUIKIT_URL = process.env.QUIKIT_URL ?? process.env.NEXT_PUBLIC_QUIKIT_URL ?? "";

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
export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
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
    const validRoles = await prisma.hrmsAppRole.count({
      where: { id: { in: data.roleIds }, orgId: orgId },
    });
    if (validRoles !== data.roleIds.length) return validationError("One or more roles are invalid");

    // Provision the person in central QuikIT as an org "member" (their HRMS role
    // is whatever the admin picked, stored in HRMS's own DB; central is always
    // "member"). This is what lets them sign in via QuikIT SSO. New central users
    // get a temp password we email; existing QuikIT users are linked by email.
    const provision = await provisionMemberRemote({
      orgId: orgId,
      email,
      firstName: data.firstName,
      lastName: data.lastName,
      appSlug: QUIKHRMS_APP_SLUG,
      invitationMethod: data.invitationMethod,
    });
    if (!provision.ok) {
      // Best-effort: central QuikIT provisioning is optional. If it's unavailable
      // (e.g. the central member endpoint isn't deployed), still create the local
      // invitation and send the SSO invite email — the invitee signs in via QuikIT
      // SSO (mirrors the bulk employee-import flow). Don't fail the invite.
      // invitationToken / tempPassword stay null below, so the email carries the
      // plain login link instead of a central accept link.
      console.warn("[invitations] central provisioning unavailable — sending SSO invite:", email, provision.error);
    }

    // token hash satisfies the Invitation.token @unique column; it's no longer
    // emailed (login is SSO) but keeps each invite row uniquely keyed.
    const { hash } = generateInviteToken();
    const expiresAt = inviteExpiry();

    let invitation;
    try {
      invitation = await prisma.invitation.create({
        data: {
          orgId,
          email,
          firstName: data.firstName,
          lastName: data.lastName,
          roleIds: data.roleIds,
          departmentId: data.departmentId ?? null,
          designationId: data.designationId ?? null,
          managerId: data.managerId ?? null,
          token: hash,
          // Persist the central accept token (new native users only) so resend can
          // rebuild the same accept link without re-provisioning.
          centralInviteToken: provision.invitationToken ?? null,
          expiresAt,
          status: "Pending",
          invitedBy: userId,
        },
      });
    } catch (createErr) {
      // Dual-write compensation: the central provision succeeded but our side
      // failed, which would leave a central account with no HRMS invite (and a
      // temp password no one was emailed). Undo the provision for brand-new
      // users so the admin can simply retry; existing users were only linked,
      // and central's guarded DELETE won't touch them anyway.
      if (provision.isNewUser && provision.userId) {
        const rollback = await deprovisionMemberRemote({
          orgId: orgId,
          userId: provision.userId,
          appSlug: QUIKHRMS_APP_SLUG,
        });
        if (!rollback.ok) {
          console.error("[invitations] central rollback failed — manual cleanup may be needed:", provision.userId, rollback.error);
        }
      }
      throw createErr;
    }

    const inviter = await prisma.employee.findFirst({
      where: { id: userId, orgId },
      select: { firstName: true, lastName: true },
    });

    // New native users go through the central accept flow (enter temp password →
    // set their own); this works regardless of any existing session in the
    // browser. Existing/SSO users just sign in via the normal login redirect.
    const setupUrl =
      provision.invitationToken && QUIKIT_URL
        ? `${QUIKIT_URL.replace(/\/$/, "")}/invitations/accept?token=${encodeURIComponent(provision.invitationToken)}`
        : null;

    const mail = await dispatchInvitationEmail({
      orgId,
      to: email,
      inviteeName: `${data.firstName} ${data.lastName}`.trim(),
      loginUrl: `${req.nextUrl.origin}${BASE_PATH}/login`,
      setupUrl,
      expiresAt,
      inviterName: inviter ? `${inviter.firstName} ${inviter.lastName}`.trim() : null,
      // Only brand-new QuikIT users get a temp password to include in the email.
      tempPassword: provision.tempPassword ?? null,
    });

    await createAuditLog({
      orgId, userId, action: "Create", entityType: "Invitation", entityId: invitation.id,
      metadata: { email, roleIds: data.roleIds, method: data.invitationMethod, emailQueued: mail.queued, emailSent: mail.sent },
    });

    return successResponse(
      // emailSent stays true when queued OR sent so the existing UI toast reads "email sent".
      { id: invitation.id, email, status: "Pending", expiresAt, emailSent: mail.queued || mail.sent, emailError: mail.error },
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

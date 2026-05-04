import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withAdminAuth } from "@/lib/api/withAdminAuth";
import { gateModuleApi } from "@quikit/auth/feature-gate";
import { db } from "@/lib/db";
import { sendInvitationEmail } from "@/lib/email";
import { ROLE_LABELS } from "@/lib/constants";
import { inviteMemberSchema } from "@/lib/schemas/memberSchema";
import { writeAuditLog } from "@/lib/audit";
import crypto from "crypto";

export const GET = withAdminAuth(async ({ orgId }, request: NextRequest) => {
  const blocked = await gateModuleApi("admin", "members", orgId);
  if (blocked) return blocked as NextResponse;

  // Pagination
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10) || 50));
  const skip = (page - 1) * limit;

  const [memberships, total] = await Promise.all([
    db.orgMember.findMany({
      where: { orgId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatar: true,
            lastSignInAt: true,
            userTeams: {
              where: { orgId },
              include: { team: { select: { name: true } } },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    db.orgMember.count({ where: { orgId } }),
  ]);

  const memberData = memberships.map((m) => ({
    id: m.userId,
    membershipId: m.id,
    firstName: m.user.firstName,
    lastName: m.user.lastName,
    email: m.user.email,
    avatar: m.user.avatar,
    role: m.role,
    status: m.status,
    teamNames: m.user.userTeams.map((ut) => ut.team.name),
    lastSignInAt: m.user.lastSignInAt?.toISOString() ?? null,
    invitedAt: m.invitedAt?.toISOString() ?? null,
    acceptedAt: m.acceptedAt?.toISOString() ?? null,
  }));

  return NextResponse.json({
    success: true,
    data: memberData,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

export const POST = withAdminAuth(async ({ orgId, userId: inviterId }, request: NextRequest) => {
  const blocked = await gateModuleApi("admin", "members", orgId);
  if (blocked) return blocked as NextResponse;

  const body = await request.json();
  const parsed = inviteMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { email, firstName, lastName, role } = parsed.data;

  // Tenant lookup is needed for domain allowlist check, branding, AND email send.
  const org = await db.org.findUnique({
    where: { id: orgId },
    select: { name: true, logoUrl: true, brandColor: true, allowedEmailDomains: true },
  });

  // Domain allowlist enforcement (empty list = unrestricted).
  if (org?.allowedEmailDomains && org.allowedEmailDomains.length > 0) {
    const emailDomain = email.split("@")[1]?.toLowerCase() ?? "";
    const allowed = org.allowedEmailDomains.map((d) => d.toLowerCase());
    if (!allowed.includes(emailDomain)) {
      return NextResponse.json(
        {
          success: false,
          error: `Email domain not allowed for this organisation. Permitted domains: ${allowed.join(", ")}`,
        },
        { status: 422 }
      );
    }
  }

  // Anti-enumeration: a duplicate invite attempt (active member or pending
  // invite for the same email) returns the SAME generic success response as
  // a fresh invite. We log the duplicate to AuditLog so a real admin can
  // notice; an attacker probing for member emails sees nothing.
  let user = await db.user.findUnique({ where: { email } });

  if (user) {
    const existingMembership = await db.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId: user.id } },
    });

    if (existingMembership && (existingMembership.status === "active" || existingMembership.status === "invited")) {
      await writeAuditLog({
        orgId,
        actorId: inviterId,
        action: "DUPLICATE_INVITE",
        entityType: "Membership",
        entityId: existingMembership.id,
        reason: `status=${existingMembership.status}`,
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });
      return NextResponse.json({
        success: true,
        message: `Invitation sent to ${email}`,
      });
    }
  }

  const invitationToken = crypto.randomUUID();

  // Create user if they don't exist
  if (!user) {
    user = await db.user.create({
      data: {
        email,
        firstName,
        lastName,
      },
    });
  }

  // Create or upsert the membership
  const membership = await db.orgMember.upsert({
    where: { orgId_userId: { orgId, userId: user.id } },
    create: {
      orgId,
      userId: user.id,
      role,
      status: "invited",
      invitationToken,
      invitedAt: new Date(),
      createdBy: inviterId,
    },
    update: {
      role,
      status: "invited",
      invitationToken,
      invitedAt: new Date(),
      createdBy: inviterId,
    },
  });

  // Get inviter name for email
  const inviter = await db.user.findUnique({
    where: { id: inviterId },
    select: { firstName: true, lastName: true },
  });

  // Send invitation email (tenant-branded)
  await sendInvitationEmail({
    to: email,
    orgName: org?.name || "Organisation",
    orgLogoUrl: org?.logoUrl ?? null,
    orgBrandColor: org?.brandColor ?? null,
    inviterName: inviter ? `${inviter.firstName} ${inviter.lastName}` : "An admin",
    role: ROLE_LABELS[role] || role,
    token: invitationToken,
  });

  // Audit log
  await writeAuditLog({
    orgId,
    actorId: inviterId,
    action: "INVITED",
    entityType: "Membership",
    entityId: membership.id,
    newValues: { email, role, firstName, lastName },
    ipAddress: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({
    success: true,
    message: `Invitation sent to ${email}`,
  });
});

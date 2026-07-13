import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api/requireAdmin";
import {
  getQuikSupportAppId,
  seedAllDefaultRoles,
  ensureUserOnRole,
} from "@/lib/api/seedAppRole";
import { INVITE_METHOD, renderInvitationEmail, type SsoProvider } from "@quikit/shared";
import { classifySsoProviderAsync } from "@quikit/shared/sso-domain-server";
import { generateTempPassword } from "@quikit/shared/temp-password";
import { sendHtmlEmail } from "@/lib/email";

/**
 * In-app user management for QuikSupport's standard RBAC (Qsp* AppRole) — the
 * same flow quiktrack/quikscale expose under /api/org/users. Admin-gated.
 *
 *   GET  — list every org member with QuikSupport UserAppAccess + their AppRole.
 *   POST — invite/add a user (3 branches) + grant UserAppAccess + assign an
 *          AppRole + send the canonical onboarding email.
 *
 * The helpdesk's own HdUser record auto-provisions on the invitee's first login
 * (lib/helpdesk-context.ts); this endpoint manages the platform RBAC layer.
 */
type InviteMethod = (typeof INVITE_METHOD)[keyof typeof INVITE_METHOD];

const createUserSchema = z.object({
  firstName: z.string().trim().min(1).max(64),
  lastName: z.string().trim().min(1).max(64),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128).optional(),
  /** OrgMember.role for a new membership. */
  role: z.enum(["owner", "admin", "member"]).optional(),
  /** QspAppRole.id to assign instead of the org default. */
  appRoleId: z.string().min(1).optional(),
  /** When set, skip user/membership creation — only grant app access + role. */
  linkExistingUserId: z.string().min(1).optional(),
  /** "native" → temp/admin password; "sso" → passwordless provider auth. */
  invitationMethod: z.enum(["native", "sso"]).optional(),
});

function buildUserResponse(
  m: {
    id: string;
    role: string;
    status: string;
    createdAt: Date;
    user: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      avatar: string | null;
      lastSignInAt: Date | null;
    };
  },
  appRole: { id: string; name: string } | null,
) {
  return {
    membershipId: m.id,
    userId: m.user.id,
    firstName: m.user.firstName,
    lastName: m.user.lastName,
    email: m.user.email,
    avatar: m.user.avatar,
    lastSignInAt: m.user.lastSignInAt?.toISOString() ?? null,
    role: m.role,
    status: m.status,
    joinedAt: m.createdAt.toISOString(),
    appRoleId: appRole?.id ?? null,
    appRoleName: appRole?.name ?? null,
  };
}

// GET /api/org/users — members with QuikSupport access + their AppRole.
export async function GET() {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId } = auth as { orgId: string };

    const appId = await getQuikSupportAppId();
    if (!appId) return NextResponse.json({ success: true, data: [] });

    const accessRows = await db.userAppAccess.findMany({
      where: { orgId, appId },
      select: { userId: true },
      distinct: ["userId"],
    });
    const userIds = accessRows.map((r) => r.userId);
    if (userIds.length === 0) return NextResponse.json({ success: true, data: [] });

    const [memberships, userRoles] = await Promise.all([
      db.orgMember.findMany({
        where: { orgId, userId: { in: userIds } },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true, avatar: true, lastSignInAt: true },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      db.qspUserAppRole.findMany({
        where: { orgId, userId: { in: userIds }, role: { appId } },
        select: { userId: true, role: { select: { id: true, name: true } } },
      }),
    ]);

    const appRoleByUserId = new Map<string, { id: string; name: string }>();
    for (const ur of userRoles) appRoleByUserId.set(ur.userId, { id: ur.role.id, name: ur.role.name });

    const users = memberships.map((m) => buildUserResponse(m, appRoleByUserId.get(m.user.id) ?? null));
    return NextResponse.json({ success: true, data: users });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list users";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/org/users — invite/add a user. Branches:
//   A. linkExistingUserId — grant app access + role to an existing org member.
//   B. email matches an existing platform User not in this org — add OrgMember.
//   C. brand-new email — create User + OrgMember.
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId, userId: actorId } = auth as { orgId: string; userId: string };

    const parsed = createUserSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const {
      firstName,
      lastName,
      email,
      password,
      role = "member",
      appRoleId,
      linkExistingUserId,
      invitationMethod = "native",
    } = parsed.data;

    const normalisedEmail = email.trim().toLowerCase();

    // SSO branch — confirm the email hosts on Google/Microsoft via MX lookup.
    let ssoProvider: SsoProvider | null = null;
    if (!linkExistingUserId && invitationMethod === INVITE_METHOD.SSO) {
      ssoProvider = (await classifySsoProviderAsync(normalisedEmail)) as SsoProvider | null;
      if (!ssoProvider) {
        return NextResponse.json(
          {
            success: false,
            error: "SSO invitations require a Google or Microsoft email address. Pick Native instead, or use a different address.",
          },
          { status: 422 },
        );
      }
    }

    // Native + no admin password → generate a friendly temp password so the
    // seeded hash matches the value the onboarding email renders.
    const isNativeNewUser = !linkExistingUserId && invitationMethod === INVITE_METHOD.NATIVE;
    const usedDefaultPassword = isNativeNewUser && !password;
    const generatedTempPassword = usedDefaultPassword ? generateTempPassword() : null;
    const effectivePassword = generatedTempPassword ?? password;

    let newUserId: string;
    let newUserCreated = false;

    if (linkExistingUserId) {
      // Path A — target must already be a member of this org.
      const existing = await db.orgMember.findUnique({
        where: { orgId_userId: { orgId, userId: linkExistingUserId } },
        select: { userId: true },
      });
      if (!existing) {
        return NextResponse.json(
          { success: false, error: "User is not a member of this organisation" },
          { status: 404 },
        );
      }
      newUserId = linkExistingUserId;
    } else {
      const existingUser = await db.user.findUnique({ where: { email: normalisedEmail } });
      const isSso = invitationMethod === INVITE_METHOD.SSO;
      if (existingUser) {
        // Path B — user exists; must not already be in this org.
        const existingMembership = await db.orgMember.findUnique({
          where: { orgId_userId: { orgId, userId: existingUser.id } },
        });
        if (existingMembership) {
          return NextResponse.json(
            {
              success: false,
              error: "This user is already a member of the organisation. Pick them from the dropdown to grant QuikSupport access.",
            },
            { status: 409 },
          );
        }
        await db.orgMember.create({
          data: {
            orgId,
            userId: existingUser.id,
            role,
            status: "active",
            createdBy: actorId,
            inviteMethod: invitationMethod,
            inviteProvider: ssoProvider,
            invitationToken: crypto.randomUUID(),
            invitedAt: new Date(),
          },
        });
        newUserId = existingUser.id;
      } else {
        // Path C — create the platform User row.
        const hashedPassword = isSso ? null : await bcrypt.hash(effectivePassword!.trim(), 12);
        const user = await db.user.create({
          data: {
            firstName,
            lastName,
            email: normalisedEmail,
            password: hashedPassword,
            mustChangePassword: !isSso,
          },
        });
        await db.orgMember.create({
          data: {
            orgId,
            userId: user.id,
            role,
            status: "active",
            createdBy: actorId,
            inviteMethod: invitationMethod,
            inviteProvider: ssoProvider,
            invitationToken: crypto.randomUUID(),
            invitedAt: new Date(),
          },
        });
        newUserId = user.id;
        newUserCreated = true;
      }
    }

    // ─── UserAppAccess + QspUserAppRole ───
    const appId = await getQuikSupportAppId();
    let appRole: { id: string; name: string } | null = null;
    if (appId) {
      const existingAccess = await db.userAppAccess.findFirst({
        where: { orgId, appId, userId: newUserId },
        select: { id: true },
      });
      if (!existingAccess) {
        await db.userAppAccess.create({
          data: { userId: newUserId, orgId, appId, role: "member", grantedBy: actorId },
        });
      }

      const { adminRoleId, userRoleId } = await seedAllDefaultRoles(orgId);

      // Resolve target AppRole: explicit > admin-if-org-has-none > default Member.
      let targetRoleId: string;
      let targetRoleName: string;
      if (appRoleId) {
        const r = await db.qspAppRole.findFirst({
          where: { id: appRoleId, orgId, appId },
          select: { id: true, name: true },
        });
        if (!r) {
          return NextResponse.json({ success: false, error: "Selected role not found" }, { status: 400 });
        }
        targetRoleId = r.id;
        targetRoleName = r.name;
      } else {
        const adminMemberCount = await db.qspUserAppRole.count({ where: { orgId, roleId: adminRoleId } });
        targetRoleId = adminMemberCount === 0 ? adminRoleId : userRoleId;
        targetRoleName = adminMemberCount === 0 ? "admin" : "Member";
      }

      await ensureUserOnRole(newUserId, orgId, targetRoleId, actorId);
      appRole = { id: targetRoleId, name: targetRoleName };
    }

    const membership = await db.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId: newUserId } },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true, avatar: true, lastSignInAt: true },
        },
      },
    });

    // ─── Onboarding email (best-effort; must not roll back user creation) ───
    if (!linkExistingUserId && membership?.invitationToken) {
      try {
        const [org, inviter] = await Promise.all([
          db.org.findUnique({ where: { id: orgId }, select: { name: true, brandColor: true } }),
          db.user.findUnique({ where: { id: actorId }, select: { firstName: true, lastName: true } }),
        ]);
        const appBaseUrl =
          process.env.NEXT_PUBLIC_QUIKIT_URL ?? process.env.QUIKIT_URL ?? "http://localhost:3000";

        const { subject, html } = renderInvitationEmail({
          to: normalisedEmail,
          firstName: firstName.trim(),
          orgName: org?.name ?? "your organisation",
          orgLogoUrl: null,
          orgBrandColor: org?.brandColor ?? null,
          inviterName: inviter
            ? `${inviter.firstName} ${inviter.lastName}`.trim() || "QuikSupport Admin"
            : "QuikSupport Admin",
          role: appRole?.name ?? "Member",
          appNames: ["QuikSupport"],
          token: membership.invitationToken,
          appBaseUrl,
          inviteMethod: invitationMethod as InviteMethod,
          ssoProvider,
          tempPassword: generatedTempPassword ?? "",
        });

        await sendHtmlEmail({ to: normalisedEmail, subject, html });
      } catch (err) {
        console.error("[org/users] onboarding email failed:", err);
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          ...buildUserResponse(membership!, appRole),
          tempPassword: generatedTempPassword ?? undefined,
        },
        meta: { usedDefaultPassword, newUserCreated },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create user";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

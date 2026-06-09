import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
// RBAC v2: per-action `User` grants gate the Users tab. Replaces the prior
// module-level gate so admins can delegate "invite users" to a non-admin
// role without also granting role-management. Admin role bypass is handled
// inside `userCan()` so admins still pass without any matrix ticks.
const auth = withOrgAuthForResource("orgSetup.users", "User");
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { createOrgUserSchema } from "@/lib/schemas/userSchema";
import { getQuikScaleAppId } from "@/lib/api/permissions";
import { seedAllDefaultRoles, ensureUserOnRole } from "@/lib/api/seedAdminAppRole";
import {
  INVITE_METHOD,
  renderInvitationEmail,
  type SsoProvider,
} from "@quikit/shared";
import { classifySsoProviderAsync } from "@quikit/shared/sso-domain-server";
import { generateTempPassword } from "@quikit/shared/temp-password";
import { sendEmail } from "@/lib/services/email";


type MembershipWithTeams = {
  id: string;
  role: string;
  teamId: string | null;
  status: string;
  createdAt: Date;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatar: string | null;
    lastSignInAt: Date | null;
    qsUserTeams: Array<{ teamId: string; team: { id: string; name: string } }>;
  };
};

function buildUserResponse(
  m: MembershipWithTeams,
  appRole?: { id: string; name: string } | null,
) {
  return {
    membershipId: m.id,
    userId:       m.user.id,
    firstName:    m.user.firstName,
    lastName:     m.user.lastName,
    email:        m.user.email,
    avatar:       m.user.avatar,
    lastSignInAt: m.user.lastSignInAt?.toISOString() ?? null,
    role:         m.role,
    teamId:       m.teamId,
    teamIds:      m.user.qsUserTeams.map(ut => ut.teamId),
    teamNames:    m.user.qsUserTeams.map(ut => ut.team.name),
    status:       m.status,
    joinedAt:     m.createdAt.toISOString(),
    /** Dynamic per-app role (from UserAppAccess.appRoleId → AppRole). */
    appRoleId:    appRole?.id ?? null,
    appRoleName:  appRole?.name ?? null,
  };
}

const USER_TEAMS_INCLUDE = (orgId: string) => ({
  qsUserTeams: {
    where: { orgId },
    include: { team: { select: { id: true, name: true } } },
  },
});

// GET /api/org/users
// Returns the membership list plus the dynamic `appRole` (AppRole) each
// user has been assigned in this tenant's QuikScale app.
//
// SCOPE: only users who have a `app_quikscale.UserAppRole` row for THIS
// org + the QuikScale app appear. Org members who only have access to
// other apps (e.g. QuikTrack via UserAppAccess but no QuikScale role)
// are filtered out — they shouldn't show up on the QuikScale Users page.
export const GET = auth.view(async ({ orgId }, req) => {
  const { page, limit, skip, take } = parsePagination(req);
  const appId = await getQuikScaleAppId();

  // Without a QuikScale App row registered the filter would let everyone
  // through. Fail safe to an empty list — admins should register the app
  // first via the seeder, then re-load this page.
  if (!appId) {
    return NextResponse.json(paginatedResponse([], 0, page, limit));
  }

  const where = {
    orgId,
    user: {
      appRoles: {
        some: { orgId, role: { appId } },
      },
    },
  };

  const [memberships, total] = await Promise.all([
    db.orgMember.findMany({
      where,
      include: {
        user: {
          select: {
            id: true, firstName: true, lastName: true, email: true, avatar: true, lastSignInAt: true,
            qsUserTeams: { where: { orgId }, include: { team: { select: { id: true, name: true } } } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
      skip,
      take,
    }),
    db.orgMember.count({ where }),
  ]);

  // Build a userId → appRole map in a single query. Roles now live in
  // app_quikscale.UserAppRole (a join table) instead of as a column on
  // quikit.UserAppAccess.
  //
  // The UserAppRole model is optional infrastructure — when it isn't present
  // in the generated Prisma client (schema not yet migrated in this env),
  // skip the lookup so the user list still loads. The appRole fields on
  // each row are advisory; the Users page doesn't read them.
  const appRoleByUserId = new Map<string, { id: string; name: string } | null>();
  const userAppRoleDelegate = (db as unknown as { userAppRole?: { findMany: (args: unknown) => Promise<Array<{ userId: string; role: { id: string; name: string; appId: string } }>> } }).userAppRole;
  if (appId && memberships.length > 0 && userAppRoleDelegate) {
    try {
      const userIds = memberships.map(m => m.user.id);
      const userRoles = await userAppRoleDelegate.findMany({
        where: { orgId, userId: { in: userIds } },
        select: { userId: true, role: { select: { id: true, name: true, appId: true } } },
      });
      for (const ur of userRoles) {
        if (ur.role.appId !== appId) continue; // ignore other apps' roles
        appRoleByUserId.set(ur.userId, { id: ur.role.id, name: ur.role.name });
      }
    } catch {
      // UserAppRole table missing or query failed — leave map empty.
    }
  }

  const users = memberships.map(m =>
    buildUserResponse(m, appRoleByUserId.get(m.user.id) ?? null),
  );
  return NextResponse.json(paginatedResponse(users, total, page, limit));
}, { fallbackErrorMessage: "Failed to fetch users" });

// POST /api/org/users
export const POST = auth.create(async ({ orgId, userId }, req) => {
  const parsed = createOrgUserSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { firstName, lastName, email, password, teamIds = [], teamId, linkExistingUserId, invitationMethod = "native" } = parsed.data;
  // OrgMember.role is intentionally pinned to "member" for every QuikScale
  // invitee — app-level authority (Admin / Manager / custom roles) lives in
  // app_quikscale.UserAppRole. The shared role-tier requireAdmin() reads v2
  // admin status via the QuikScale `extraAdminCheck` bridge, not this column.
  const role = "member";
  const resolvedTeamIds: string[] = teamIds.length ? teamIds : teamId ? [teamId] : [];
  const normalisedEmail = email.trim().toLowerCase();

  // FR-SA-004 — for SSO invites the email must resolve to a known SSO provider
  // (Google/Microsoft, either consumer or MX-validated). Reject early so we
  // don't end up with a passwordless user that can never sign in.
  let ssoProvider: SsoProvider | null = null;
  if (!linkExistingUserId && invitationMethod === INVITE_METHOD.SSO) {
    ssoProvider = await classifySsoProviderAsync(normalisedEmail);
    if (!ssoProvider) {
      return NextResponse.json(
        { success: false, error: "SSO invitations require a Google or Microsoft email address." },
        { status: 422 },
      );
    }
  }

  // For Native invites with no admin-supplied password, generate a fresh
  // friendly temp password so the user receives it via email and must
  // change it on first login. Matches the super-admin first-Org-Admin flow.
  const isNativeNewUser =
    !linkExistingUserId && invitationMethod === INVITE_METHOD.NATIVE;
  const usedDefaultPassword = isNativeNewUser && !password;
  const generatedTempPassword = usedDefaultPassword ? generateTempPassword() : null;
  const effectivePassword = generatedTempPassword ?? password;

  let newUserId: string;
  let newUserCreated = false;

  if (linkExistingUserId) {
    // Path A: link an existing org member into QuikScale. The user picked
    // them from the email autocomplete dropdown. They already have a
    // password + OrgMember row; we only need to grant UserAppAccess +
    // AppRole + team memberships (handled below).
    const member = await db.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId: linkExistingUserId } },
      select: { userId: true },
    });
    if (!member) {
      return NextResponse.json(
        { success: false, error: "User is not a member of this organisation" },
        { status: 404 },
      );
    }
    newUserId = member.userId;
  } else {
    const existingUser = await db.user.findUnique({ where: { email: normalisedEmail } });

    if (existingUser) {
      const existingMembership = await db.orgMember.findUnique({
        where: { orgId_userId: { orgId, userId: existingUser.id } },
      });
      if (existingMembership)
        return NextResponse.json({ success: false, error: "This user is already a member of the organisation. Pick them from the email dropdown to grant QuikScale access." }, { status: 409 });

      await db.orgMember.create({
        data: {
          orgId,
          userId: existingUser.id,
          role,
          teamId: resolvedTeamIds[0] ?? null,
          status: "active",
          createdBy: userId,
          invitationToken: crypto.randomUUID(),
          invitedAt: new Date(),
          inviteMethod: invitationMethod,
          inviteProvider: ssoProvider,
        },
      });
      newUserId = existingUser.id;
    } else {
      // SSO invites get no password — `auth.User.password` is nullable so the
      // credentials provider can't authenticate them; only OAuth (Google /
      // Microsoft) will work. Native invites either use an admin-supplied
      // password OR the system default (Quikit2026); either way
      // mustChangePassword forces a reset on first login.
      const isSso = invitationMethod === INVITE_METHOD.SSO;
      const hashedPassword = isSso
        ? null
        : await bcrypt.hash(effectivePassword!.trim(), 12);
      const user = await db.user.create({
        data: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
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
          teamId: resolvedTeamIds[0] ?? null,
          status: "active",
          createdBy: userId,
          invitationToken: crypto.randomUUID(),
          invitedAt: new Date(),
          inviteMethod: invitationMethod,
          inviteProvider: ssoProvider,
        },
      });
      newUserId = user.id;
      newUserCreated = true;
    }
  }

  for (const teamId of resolvedTeamIds) {
    await db.qsUserTeam.upsert({
      where:  { orgId_userId_teamId: { orgId, userId: newUserId, teamId } },
      update: {},
      create: { orgId, userId: newUserId, teamId },
    });
  }

  const membership = await db.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId: newUserId } },
    include: {
      user: {
        select: {
          id: true, firstName: true, lastName: true, email: true, avatar: true, lastSignInAt: true,
          qsUserTeams: { where: { orgId }, include: { team: { select: { id: true, name: true } } } },
        },
      },
    },
  });

  // ── Auto-grant QuikScale access + default AppRole ──────────────────────
  // When a user is invited via this endpoint:
  //   1. Grant UserAppAccess (idempotent)
  //   2. Seed both default roles (admin + User) for this org — idempotent.
  //   3. Assign the new user to the User role (the org's default for invitees).
  //      Admin role is reserved for the org creator + explicit admin promotion
  //      via PATCH /api/org/users/[id]/role.
  // If the org has zero admin members (edge case — should not happen in
  // normal flow), the FIRST invited user falls back to admin to avoid a
  // permanently-locked org.
  const appId = await getQuikScaleAppId();
  let appRole: { id: string; name: string } | null = null;
  if (appId) {
    const existingAccess = await db.userAppAccess.findFirst({
      where: { orgId, appId, userId: newUserId },
      select: { id: true },
    });
    if (!existingAccess) {
      await db.userAppAccess.create({
        data: {
          userId: newUserId,
          orgId,
          appId,
          role: "member",
          grantedBy: userId,
        },
      });
    }

    const { adminRoleId, userRoleId } = await seedAllDefaultRoles(orgId);

    // Safety: if no admins exist on this org yet, the new user becomes the
    // first admin instead of a regular user. Prevents an admin-less org.
    const adminMemberCount = await db.userAppRole.count({
      where: { orgId, roleId: adminRoleId },
    });
    const targetRoleId = adminMemberCount === 0 ? adminRoleId : userRoleId;
    const targetRoleName = adminMemberCount === 0 ? "admin" : "User";

    await ensureUserOnRole(newUserId, orgId, targetRoleId, userId);

    appRole = { id: targetRoleId, name: targetRoleName };
  }

  // ── Send onboarding invitation email ───────────────────────────────────
  // Sent for fresh invites (Native or SSO) — not when linking an existing
  // org member into QuikScale (they keep their existing credentials and
  // already know how to log in). Email render + transport failures are
  // logged but do not roll back the user creation.
  if (!linkExistingUserId && membership?.invitationToken) {
    try {
      const [org, inviter, appRow] = await Promise.all([
        db.org.findUnique({
          where: { id: orgId },
          select: { name: true, brandColor: true },
        }),
        db.user.findUnique({
          where: { id: userId },
          select: { firstName: true, lastName: true },
        }),
        appId
          ? db.app.findUnique({ where: { id: appId }, select: { name: true } })
          : Promise.resolve(null),
      ]);

      // Invitation links land users on the QuikIT launcher (:3001 in dev),
      // whose marketing landing auto-opens a LoginModal whenever the URL
      // has `?next=…` (set by the launcher's middleware when an
      // unauthenticated visitor hits /invitations/accept). We deliberately
      // do NOT use NEXT_PUBLIC_AUTH_URL or NEXTAUTH_URL — the former
      // points at the central credentials host (:3000) and the latter at
      // QuikScale itself (:3003), neither of which is the experience we
      // want when the user clicks "Set Up My Account".
      const appBaseUrl =
        process.env.NEXT_PUBLIC_QUIKIT_URL ??
        process.env.QUIKIT_URL ??
        "http://localhost:3001";

      const { subject, html } = renderInvitationEmail({
        to: normalisedEmail,
        firstName: firstName.trim(),
        orgName: org?.name ?? "your organisation",
        orgLogoUrl: null,
        orgBrandColor: org?.brandColor ?? null,
        inviterName: inviter
          ? `${inviter.firstName} ${inviter.lastName}`.trim() || "QuikScale Admin"
          : "QuikScale Admin",
        role: appRole?.name ?? "User",
        appNames: [appRow?.name ?? "QuikScale"],
        token: membership.invitationToken,
        appBaseUrl,
        inviteMethod: invitationMethod,
        ssoProvider,
        tempPassword: generatedTempPassword ?? "",
      });

      await sendEmail({ to: normalisedEmail, subject, html });
    } catch (err) {
      console.error("[org/users] onboarding email failed:", err);
    }
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        ...buildUserResponse(membership!, appRole),
        // Plaintext temp password — shown ONCE in the QuikScale admin UI
        // when the server generated one (Native + no admin-supplied pw).
        tempPassword: generatedTempPassword ?? undefined,
      },
      meta: {
        usedDefaultPassword,
        newUserCreated,
      },
    },
    { status: 201 },
  );
}, { fallbackErrorMessage: "Failed to create user" });

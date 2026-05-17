import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
const withOrgAuth = withOrgAuthForModule("orgSetup.users");
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { createOrgUserSchema } from "@/lib/schemas/userSchema";
import { getQuikScaleAppId } from "@/lib/api/permissions";
import { seedAllDefaultRoles, ensureUserOnRole } from "@/lib/api/seedAdminAppRole";


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
    userTeams: Array<{ teamId: string; team: { id: string; name: string } }>;
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
    teamIds:      m.user.userTeams.map(ut => ut.teamId),
    teamNames:    m.user.userTeams.map(ut => ut.team.name),
    status:       m.status,
    joinedAt:     m.createdAt.toISOString(),
    /** Dynamic per-app role (from UserAppAccess.appRoleId → AppRole). */
    appRoleId:    appRole?.id ?? null,
    appRoleName:  appRole?.name ?? null,
  };
}

const USER_TEAMS_INCLUDE = (orgId: string) => ({
  userTeams: {
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
export const GET = withOrgAuth(async ({ orgId }, req) => {
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
            userTeams: { where: { orgId }, include: { team: { select: { id: true, name: true } } } },
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
export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const parsed = createOrgUserSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { firstName, lastName, email, password, role = "member", teamIds = [], teamId, linkExistingUserId, invitationMethod = "native" } = parsed.data;
  const resolvedTeamIds: string[] = teamIds.length ? teamIds : teamId ? [teamId] : [];

  let newUserId: string;

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
    const existingUser = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });

    if (existingUser) {
      const existingMembership = await db.orgMember.findUnique({
        where: { orgId_userId: { orgId, userId: existingUser.id } },
      });
      if (existingMembership)
        return NextResponse.json({ success: false, error: "This user is already a member of the organisation. Pick them from the email dropdown to grant QuikScale access." }, { status: 409 });

      await db.orgMember.create({
        data: { orgId, userId: existingUser.id, role, teamId: resolvedTeamIds[0] ?? null, status: "active", createdBy: userId },
      });
      newUserId = existingUser.id;
    } else {
      // SSO invites get no password — `auth.User.password` is nullable so the
      // credentials provider can't authenticate them; only OAuth (Google /
      // Microsoft) will work. Native invites take the existing path.
      const isSso = invitationMethod === "sso";
      if (!isSso && !password) {
        return NextResponse.json(
          { success: false, error: "Password is required for new users" },
          { status: 400 },
        );
      }
      const hashedPassword = isSso ? null : await bcrypt.hash(password!.trim(), 12);
      const user = await db.user.create({
        data: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim().toLowerCase(),
          password: hashedPassword,
        },
      });
      await db.orgMember.create({
        data: { orgId, userId: user.id, role, teamId: resolvedTeamIds[0] ?? null, status: "active", createdBy: userId },
      });
      newUserId = user.id;
    }
  }

  for (const teamId of resolvedTeamIds) {
    await db.userTeam.upsert({
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
          userTeams: { where: { orgId }, include: { team: { select: { id: true, name: true } } } },
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

  return NextResponse.json(
    { success: true, data: buildUserResponse(membership!, appRole) },
    { status: 201 },
  );
}, { fallbackErrorMessage: "Failed to create user" });

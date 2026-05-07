import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
const withOrgAuth = withOrgAuthForModule("orgSetup.users");
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { createOrgUserSchema } from "@/lib/schemas/userSchema";
import { getQuikScaleAppId } from "@/lib/api/permissions";
import { seedAdminAppRole, ensureUserOnRole } from "@/lib/api/seedAdminAppRole";


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
// user has been assigned in this tenant's QuikScale app. Used by both the
// Org Setup → Users page and the new Roles & Permissions Users list.
export const GET = withOrgAuth(async ({ orgId }, req) => {
  const { page, limit, skip, take } = parsePagination(req);
  const where = { orgId };

  const [memberships, total, appId] = await Promise.all([
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
    getQuikScaleAppId(),
  ]);

  // Build a userId → appRole map in a single query. Roles now live in
  // app_quikscale.UserAppRole (a join table) instead of as a column on
  // quikit.UserAppAccess.
  const appRoleByUserId = new Map<string, { id: string; name: string } | null>();
  if (appId && memberships.length > 0) {
    const userIds = memberships.map(m => m.user.id);
    const userRoles = await db.userAppRole.findMany({
      where: { orgId, userId: { in: userIds } },
      select: { userId: true, role: { select: { id: true, name: true, appId: true } } },
    });
    for (const ur of userRoles) {
      if (ur.role.appId !== appId) continue; // ignore other apps' roles
      appRoleByUserId.set(ur.userId, { id: ur.role.id, name: ur.role.name });
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
  const { firstName, lastName, email, password, role = "member", teamIds = [], teamId } = parsed.data;
  const resolvedTeamIds: string[] = teamIds.length ? teamIds : teamId ? [teamId] : [];

  const existingUser = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  let newUserId: string;

  if (existingUser) {
    const existingMembership = await db.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId: existingUser.id } },
    });
    if (existingMembership)
      return NextResponse.json({ success: false, error: "This user is already a member of the organisation" }, { status: 409 });

    await db.orgMember.create({
      data: { orgId, userId: existingUser.id, role, teamId: resolvedTeamIds[0] ?? null, status: "active", createdBy: userId },
    });
    newUserId = existingUser.id;
  } else {
    const hashedPassword = await bcrypt.hash(password.trim(), 12);
    const user = await db.user.create({
      data: { firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim().toLowerCase(), password: hashedPassword },
    });
    await db.orgMember.create({
      data: { orgId, userId: user.id, role, teamId: resolvedTeamIds[0] ?? null, status: "active", createdBy: userId },
    });
    newUserId = user.id;
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

  // ── Auto-grant QuikScale access + admin AppRole ────────────────────────
  // When a user is created via this endpoint, give them QuikScale access
  // and assign the org's admin AppRole (auto-creating the role + all its
  // RolePermission / RoleNavigation entries on first call).
  const appId = await getQuikScaleAppId();
  let appRole: { id: string; name: string } | null = null;
  if (appId) {
    // 1. Grant UserAppAccess (idempotent)
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

    // 2. Ensure admin AppRole + permissions + navigation exist for the org
    const adminRoleId = await seedAdminAppRole(orgId);

    // 3. Link user → admin role (idempotent)
    await ensureUserOnRole(newUserId, orgId, adminRoleId, userId);

    appRole = { id: adminRoleId, name: "admin" };
  }

  return NextResponse.json(
    { success: true, data: buildUserResponse(membership!, appRole) },
    { status: 201 },
  );
}, { fallbackErrorMessage: "Failed to create user" });

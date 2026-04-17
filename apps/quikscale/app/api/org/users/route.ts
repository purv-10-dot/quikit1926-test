import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("orgSetup.users");
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { createOrgUserSchema } from "@/lib/schemas/userSchema";


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

function buildUserResponse(m: MembershipWithTeams) {
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
  };
}

const USER_TEAMS_INCLUDE = (tenantId: string) => ({
  userTeams: {
    where: { tenantId },
    include: { team: { select: { id: true, name: true } } },
  },
});

// GET /api/org/users
export const GET = withTenantAuth(async ({ tenantId }, req) => {
  const { page, limit, skip, take } = parsePagination(req);
  const where = { tenantId };

  const [memberships, total] = await Promise.all([
    db.membership.findMany({
      where,
      include: {
        user: {
          select: {
            id: true, firstName: true, lastName: true, email: true, avatar: true, lastSignInAt: true,
            userTeams: { where: { tenantId }, include: { team: { select: { id: true, name: true } } } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
      skip,
      take,
    }),
    db.membership.count({ where }),
  ]);

  return NextResponse.json(paginatedResponse(memberships.map(buildUserResponse), total, page, limit));
}, { fallbackErrorMessage: "Failed to fetch users" });

// POST /api/org/users
export const POST = withTenantAuth(async ({ tenantId, userId }, req) => {
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
    const existingMembership = await db.membership.findUnique({
      where: { tenantId_userId: { tenantId, userId: existingUser.id } },
    });
    if (existingMembership)
      return NextResponse.json({ success: false, error: "This user is already a member of the organisation" }, { status: 409 });

    await db.membership.create({
      data: { tenantId, userId: existingUser.id, role, teamId: resolvedTeamIds[0] ?? null, status: "active", createdBy: userId },
    });
    newUserId = existingUser.id;
  } else {
    const hashedPassword = await bcrypt.hash(password.trim(), 12);
    const user = await db.user.create({
      data: { firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim().toLowerCase(), password: hashedPassword },
    });
    await db.membership.create({
      data: { tenantId, userId: user.id, role, teamId: resolvedTeamIds[0] ?? null, status: "active", createdBy: userId },
    });
    newUserId = user.id;
  }

  for (const teamId of resolvedTeamIds) {
    await db.userTeam.upsert({
      where:  { tenantId_userId_teamId: { tenantId, userId: newUserId, teamId } },
      update: {},
      create: { tenantId, userId: newUserId, teamId },
    });
  }

  const membership = await db.membership.findUnique({
    where: { tenantId_userId: { tenantId, userId: newUserId } },
    include: {
      user: {
        select: {
          id: true, firstName: true, lastName: true, email: true, avatar: true, lastSignInAt: true,
          userTeams: { where: { tenantId }, include: { team: { select: { id: true, name: true } } } },
        },
      },
    },
  });

  return NextResponse.json({ success: true, data: buildUserResponse(membership!) }, { status: 201 });
}, { fallbackErrorMessage: "Failed to create user" });

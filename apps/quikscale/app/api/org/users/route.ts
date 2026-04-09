import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { getTenantId } from "@/lib/api/getTenantId";


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
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const tenantId = await getTenantId(session.user.id);
    if (!tenantId)
      return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });

    const memberships = await db.membership.findMany({
      where: { tenantId },
      include: {
        user: {
          select: {
            id: true, firstName: true, lastName: true, email: true, avatar: true, lastSignInAt: true,
            userTeams: { where: { tenantId }, include: { team: { select: { id: true, name: true } } } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ success: true, data: memberships.map(buildUserResponse) });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to fetch users";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// POST /api/org/users
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const tenantId = await getTenantId(session.user.id);
    if (!tenantId)
      return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });

    const body = await request.json();
    const { firstName, lastName, email, password, role = "member", teamIds = [] } = body;
    const resolvedTeamIds: string[] = teamIds.length ? teamIds : body.teamId ? [body.teamId] : [];

    if (!firstName?.trim()) return NextResponse.json({ success: false, error: "First name is required" }, { status: 400 });
    if (!lastName?.trim())  return NextResponse.json({ success: false, error: "Last name is required" }, { status: 400 });
    if (!email?.trim())     return NextResponse.json({ success: false, error: "Email is required" }, { status: 400 });
    if (!password?.trim())  return NextResponse.json({ success: false, error: "Password is required" }, { status: 400 });

    const existingUser = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    let userId: string;

    if (existingUser) {
      const existingMembership = await db.membership.findUnique({
        where: { tenantId_userId: { tenantId, userId: existingUser.id } },
      });
      if (existingMembership)
        return NextResponse.json({ success: false, error: "This user is already a member of the organisation" }, { status: 409 });

      await db.membership.create({
        data: { tenantId, userId: existingUser.id, role, teamId: resolvedTeamIds[0] ?? null, status: "active", createdBy: session.user.id },
      });
      userId = existingUser.id;
    } else {
      const hashedPassword = await bcrypt.hash(password.trim(), 12);
      const user = await db.user.create({
        data: { firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim().toLowerCase(), password: hashedPassword },
      });
      await db.membership.create({
        data: { tenantId, userId: user.id, role, teamId: resolvedTeamIds[0] ?? null, status: "active", createdBy: session.user.id },
      });
      userId = user.id;
    }

    for (const teamId of resolvedTeamIds) {
      await db.userTeam.upsert({
        where:  { tenantId_userId_teamId: { tenantId, userId, teamId } },
        update: {},
        create: { tenantId, userId, teamId },
      });
    }

    const membership = await db.membership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
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
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to create user";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

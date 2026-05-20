import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { getQuikTrackAppId } from "@/lib/api/permissions";
import {
  seedAllDefaultRoles,
  ensureUserOnRole,
} from "@/lib/api/seedAdminAppRole";

const createUserSchema = z
  .object({
    firstName: z.string().trim().min(1).max(64),
    lastName: z.string().trim().min(1).max(64),
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(8).max(128).optional(),
    role: z.enum(["owner", "admin", "member"]).optional(),
    /** AppRole.id to assign instead of the org default. */
    appRoleId: z.string().min(1).optional(),
    /** Team ids to add the user to. */
    teamIds: z.array(z.string().min(1)).optional(),
    /** QtProject ids to add the user to as a MEMBER. Idempotent upserts. */
    projectIds: z.array(z.string().min(1)).optional(),
    /** When set, skip user/membership creation — only grant app access + role. */
    linkExistingUserId: z.string().min(1).optional(),
  })
  .refine(
    (d) => d.linkExistingUserId || (d.password && d.password.length >= 8),
    { message: "Password is required for new users", path: ["password"] },
  );

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
  teams: Array<{ id: string; name: string }> = [],
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
    teams,
  };
}

// GET /api/org/users â€” membership list + each user's QuikTrack AppRole.
export const GET = withOrgAuth(async ({ orgId }) => {
  const [memberships, appId] = await Promise.all([
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
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    getQuikTrackAppId(),
  ]);

  const appRoleByUserId = new Map<string, { id: string; name: string } | null>();
  const teamsByUserId = new Map<string, Array<{ id: string; name: string }>>();

  if (memberships.length > 0) {
    const userIds = memberships.map((m) => m.user.id);

    const [userRoles, teamRows] = await Promise.all([
      appId
        ? db.qtUserAppRole.findMany({
            where: { orgId, userId: { in: userIds }, role: { appId } },
            select: { userId: true, role: { select: { id: true, name: true } } },
          })
        : Promise.resolve(
            [] as Array<{ userId: string; role: { id: string; name: string } }>,
          ),
      db.userTeam.findMany({
        where: { orgId, userId: { in: userIds } },
        select: { userId: true, team: { select: { id: true, name: true } } },
      }),
    ]);

    for (const ur of userRoles) {
      appRoleByUserId.set(ur.userId, { id: ur.role.id, name: ur.role.name });
    }
    for (const t of teamRows) {
      if (!t.team) continue;
      const list = teamsByUserId.get(t.userId) ?? [];
      list.push({ id: t.team.id, name: t.team.name });
      teamsByUserId.set(t.userId, list);
    }
  }

  const users = memberships.map((m) =>
    buildUserResponse(
      m,
      appRoleByUserId.get(m.user.id) ?? null,
      teamsByUserId.get(m.user.id) ?? [],
    ),
  );
  return NextResponse.json({ success: true, data: users });
});

// POST /api/org/users — three branches per userInviteFlow.md:
//   A. linkExistingUserId set — grant app access + role + teams only
//   B. email matches existing platform User — add OrgMember + the rest
//   C. brand-new email — create User + OrgMember + the rest
export const POST = withOrgAuth(async ({ orgId, userId: actorId }, req) => {
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
    teamIds = [],
    projectIds = [],
    linkExistingUserId,
  } = parsed.data;

  // ─── Resolve newUserId across the three paths ───
  let newUserId: string;

  if (linkExistingUserId) {
    // Path A — verify the target is already a member of this org.
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
    const existingUser = await db.user.findUnique({ where: { email } });
    if (existingUser) {
      // Path B — user exists, but check if already in this org.
      const existingMembership = await db.orgMember.findUnique({
        where: { orgId_userId: { orgId, userId: existingUser.id } },
      });
      if (existingMembership) {
        return NextResponse.json(
          {
            success: false,
            error:
              "This user is already a member of the organisation. Pick them from the email dropdown to grant QuikTrack access.",
          },
          { status: 409 },
        );
      }
      await db.orgMember.create({
        data: { orgId, userId: existingUser.id, role, status: "active", createdBy: actorId },
      });
      newUserId = existingUser.id;
    } else {
      // Path C — create the User row.
      if (!password) {
        return NextResponse.json(
          { success: false, error: "Password is required for new users" },
          { status: 400 },
        );
      }
      const hashedPassword = await bcrypt.hash(password, 12);
      const user = await db.user.create({
        data: { firstName, lastName, email, password: hashedPassword },
      });
      await db.orgMember.create({
        data: { orgId, userId: user.id, role, status: "active", createdBy: actorId },
      });
      newUserId = user.id;
    }
  }

  // ─── Teams (idempotent upserts) ───
  for (const teamId of teamIds) {
    await db.userTeam.upsert({
      where: { orgId_userId_teamId: { orgId, userId: newUserId, teamId } },
      update: {},
      create: { orgId, userId: newUserId, teamId },
    });
  }

  // ─── Projects (idempotent QtProjectMember upserts) ───
  // Only attach to projects that actually belong to this org — protects
  // against an admin pasting a cross-tenant projectId.
  if (projectIds.length > 0) {
    const validProjects = await db.qtProject.findMany({
      where: { id: { in: projectIds }, orgId, isDeleted: false },
      select: { id: true },
    });
    for (const p of validProjects) {
      await db.qtProjectMember.upsert({
        where: { projectId_userId: { projectId: p.id, userId: newUserId } },
        update: { isDeleted: false },
        create: {
          projectId: p.id,
          userId: newUserId,
          role: "MEMBER",
          invitedBy: actorId,
        },
      });
    }
  }

  // ─── UserAppAccess + UserAppRole ───
  const appId = await getQuikTrackAppId();
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

    // Resolve target AppRole: explicit > admin-fallback > default User.
    let targetRoleId: string;
    let targetRoleName: string;
    if (appRoleId) {
      const r = await db.qtAppRole.findFirst({
        where: { id: appRoleId, orgId, appId },
        select: { id: true, name: true },
      });
      if (!r) {
        return NextResponse.json(
          { success: false, error: "Selected role not found" },
          { status: 400 },
        );
      }
      targetRoleId = r.id;
      targetRoleName = r.name;
    } else {
      // Safety: if the org has zero admin members, the first invitee
      // becomes admin to prevent an admin-less org.
      const adminMemberCount = await db.qtUserAppRole.count({
        where: { orgId, roleId: adminRoleId },
      });
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
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          avatar: true,
          lastSignInAt: true,
        },
      },
    },
  });

  return NextResponse.json(
    { success: true, data: buildUserResponse(membership!, appRole, []) },
    { status: 201 },
  );
});

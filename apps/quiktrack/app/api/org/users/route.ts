import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { getQuikTrackAppId } from "@/lib/api/permissions";
import {
  seedAllDefaultRoles,
  ensureUserOnRole,
} from "@/lib/api/seedAdminAppRole";
import { renderInvitationEmail } from "@quikit/shared";
import { classifySsoProviderAsync } from "@quikit/shared/sso-domain-server";
import { sendEmail } from "@/lib/email/sendEmail";

// Local copies of the constants — the @quikit/shared barrel doesn't re-export
// them yet, and apps can't modify packages/. Values mirror
// packages/shared/lib/constants.ts exactly.
const INVITE_METHOD = { NATIVE: "native", SSO: "sso" } as const;
type InviteMethod = (typeof INVITE_METHOD)[keyof typeof INVITE_METHOD];
type SsoProvider = "google" | "microsoft";
/** Native invitations seed this password when the admin omits one. Mirrors
 *  packages/shared/lib/constants.ts and the password policy denylist in the
 *  auth app's /api/invitations/accept handler. */
const DEFAULT_INVITE_PASSWORD = "Quikit2026";

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
    /** QtProject ids to add the user to as a MEMBER. Idempotent upserts.
     *  Legacy shape — superseded by `projects` below. Still accepted. */
    projectIds: z.array(z.string().min(1)).optional(),
    /**
     * Per-project membership + role assignment. Each entry creates a
     * QtProjectMember row and, if `projectRoleId` is set, also a
     * QtProjectUserRole row pointing at that role. Omit `projectRoleId`
     * to fall back to the project's seeded default role.
     */
    projects: z
      .array(
        z.object({
          projectId: z.string().min(1),
          projectRoleId: z.string().min(1).optional(),
        }),
      )
      .optional(),
    /** When set, skip user/membership creation — only grant app access + role. */
    linkExistingUserId: z.string().min(1).optional(),
    /**
     * "native" → admin-supplied (or default) password; credentials sign-in.
     * "sso"    → no password; provider auth (Google / Microsoft) only.
     * Defaults to "native" for back-compat with the old payload shape.
     */
    invitationMethod: z.enum(["native", "sso"]).optional(),
  })
  // No refine on password — Native invites without a password get the
  // DEFAULT_INVITE_PASSWORD seeded server-side. If a password IS supplied,
  // Zod's `min(8)` on the field itself still enforces strength.
  ;

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
    projects: projectAssignments = [],
    linkExistingUserId,
    invitationMethod = "native",
  } = parsed.data;

  const normalisedEmail = email.trim().toLowerCase();

  // SSO branch — confirm the email actually hosts on Google Workspace or
  // Microsoft 365 via MX lookup. We don't want to mint a passwordless user
  // who can never sign in.
  let ssoProvider: SsoProvider | null = null;
  if (!linkExistingUserId && invitationMethod === INVITE_METHOD.SSO) {
    ssoProvider = (await classifySsoProviderAsync(normalisedEmail)) as SsoProvider | null;
    if (!ssoProvider) {
      return NextResponse.json(
        {
          success: false,
          error:
            "SSO invitations require a Google or Microsoft email address. Pick Native instead, or use a different address.",
        },
        { status: 422 },
      );
    }
  }

  // Merge legacy + new shape into a single list of (projectId, optional role).
  // The new `projects` shape wins when both supply the same id.
  const projectMap = new Map<string, { projectId: string; projectRoleId?: string }>();
  for (const id of projectIds) projectMap.set(id, { projectId: id });
  for (const p of projectAssignments) projectMap.set(p.projectId, p);
  const projectAssignList = Array.from(projectMap.values());

  // ─── Resolve newUserId across the three paths ───
  let newUserId: string;
  /** True when the admin omitted a password and the server seeded the
   *  DEFAULT_INVITE_PASSWORD for a Native invite. Surfaced in `meta` so the
   *  admin UI can show a toast like "Temporary password Quikit2026 emailed
   *  to jane@…". */
  let usedDefaultPassword = false;
  /** True when path C ran (brand-new auth.User row created). False for
   *  linking + existing-email paths. Helps the UI decide whether to refresh
   *  the user list or just toast "Granted access". */
  let newUserCreated = false;

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
    const existingUser = await db.user.findUnique({ where: { email: normalisedEmail } });
    const isSso = invitationMethod === INVITE_METHOD.SSO;
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
        data: {
          orgId,
          userId: existingUser.id,
          role,
          // SSO members start as "invited" so the auth signIn callback flips
          // them active on first OAuth login. Native members keep the
          // existing "active" default (legacy QuikTrack behaviour).
          status: isSso ? "invited" : "active",
          createdBy: actorId,
          inviteMethod: invitationMethod,
          inviteProvider: ssoProvider,
          invitationToken: crypto.randomUUID(),
          invitedAt: new Date(),
        },
      });
      newUserId = existingUser.id;
    } else {
      // Path C — create the User row.
      //
      // SSO → password stays NULL so the credentials provider can't auth.
      // Native → admin-supplied password, OR seed DEFAULT_INVITE_PASSWORD
      //          ("Quikit2026") if the admin left it blank. The default
      //          gets emailed to the invitee verbatim; they're forced to
      //          change it on first login via the accept-invite flow.
      const effectivePassword = isSso
        ? null
        : password && password.length > 0
          ? password
          : DEFAULT_INVITE_PASSWORD;
      usedDefaultPassword =
        !isSso && (!password || password.length === 0);
      const hashedPassword = isSso
        ? null
        : await bcrypt.hash(effectivePassword!, 12);
      const user = await db.user.create({
        data: {
          firstName,
          lastName,
          email: normalisedEmail,
          password: hashedPassword,
          // Native invitees must reset on first login; SSO never has a password.
          mustChangePassword: !isSso,
        },
      });
      await db.orgMember.create({
        data: {
          orgId,
          userId: user.id,
          role,
          status: isSso ? "invited" : "active",
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

  // ─── Teams (idempotent upserts) ───
  for (const teamId of teamIds) {
    await db.userTeam.upsert({
      where: { orgId_userId_teamId: { orgId, userId: newUserId, teamId } },
      update: {},
      create: { orgId, userId: newUserId, teamId },
    });
  }

  // ─── Projects (idempotent QtProjectMember + optional QtProjectUserRole) ───
  // Only attach to projects that actually belong to this org — protects
  // against an admin pasting a cross-tenant projectId. For each project the
  // admin may also pin a specific project role; if omitted, the project's
  // seeded default role is used.
  if (projectAssignList.length > 0) {
    const candidateIds = projectAssignList.map((p) => p.projectId);
    const validProjects = await db.qtProject.findMany({
      where: { id: { in: candidateIds }, orgId, isDeleted: false },
      select: { id: true },
    });
    const validIdSet = new Set(validProjects.map((p) => p.id));

    for (const assign of projectAssignList) {
      if (!validIdSet.has(assign.projectId)) continue;

      // 1. Membership row (legacy presence + enum).
      await db.qtProjectMember.upsert({
        where: { projectId_userId: { projectId: assign.projectId, userId: newUserId } },
        update: { isDeleted: false },
        create: {
          projectId: assign.projectId,
          userId: newUserId,
          role: "MEMBER",
          invitedBy: actorId,
        },
      });

      // 2. Resolve which project role to assign. Explicit > project default.
      let targetProjectRoleId: string | null = null;
      if (assign.projectRoleId) {
        const r = await db.qtProjectRole.findFirst({
          where: { id: assign.projectRoleId, projectId: assign.projectId },
          select: { id: true },
        });
        targetProjectRoleId = r?.id ?? null;
      } else {
        const def = await db.qtProjectRole.findFirst({
          where: { projectId: assign.projectId, isDefault: true },
          select: { id: true },
        });
        targetProjectRoleId = def?.id ?? null;
      }

      // 3. Dynamic project-role assignment (Layer 2). One row per (project, user).
      if (targetProjectRoleId) {
        await db.qtProjectUserRole.upsert({
          where: { projectId_userId: { projectId: assign.projectId, userId: newUserId } },
          update: { projectRoleId: targetProjectRoleId, assignedBy: actorId },
          create: {
            projectId: assign.projectId,
            userId: newUserId,
            projectRoleId: targetProjectRoleId,
            assignedBy: actorId,
          },
        });
      }
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

  // ─── Onboarding email ───
  // Native: "Here's your temporary password" + link to /login
  // SSO:    "Sign in with Google/Microsoft" — never includes a password,
  //         link to /login; the auth signIn callback auto-accepts the
  //         pending invite on first OAuth round-trip.
  if (!linkExistingUserId && membership?.invitationToken) {
    try {
      const [org, inviter] = await Promise.all([
        db.org.findUnique({
          where: { id: orgId },
          select: { name: true, brandColor: true },
        }),
        db.user.findUnique({
          where: { id: actorId },
          select: { firstName: true, lastName: true },
        }),
      ]);

      const appBaseUrl =
        process.env.NEXT_PUBLIC_AUTH_URL ??
        process.env.NEXTAUTH_URL ??
        "http://localhost:3004";

      const { subject, html } = renderInvitationEmail({
        to: normalisedEmail,
        firstName: firstName.trim(),
        orgName: org?.name ?? "your organisation",
        orgLogoUrl: null,
        orgBrandColor: org?.brandColor ?? null,
        inviterName:
          inviter
            ? `${inviter.firstName} ${inviter.lastName}`.trim() || "QuikTrack Admin"
            : "QuikTrack Admin",
        role: appRole?.name ?? "Member",
        appNames: ["QuikTrack"],
        token: membership.invitationToken,
        appBaseUrl,
        inviteMethod: invitationMethod as InviteMethod,
        ssoProvider,
      });

      await sendEmail({ to: normalisedEmail, subject, html });
    } catch (err) {
      // Email failures must not roll back user creation.
      console.error("[org/users] onboarding email failed:", err);
    }
  }

  return NextResponse.json(
    {
      success: true,
      data: buildUserResponse(membership!, appRole, []),
      meta: { usedDefaultPassword, newUserCreated },
    },
    { status: 201 },
  );
});
